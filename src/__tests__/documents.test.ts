/**
 * Boundary schema vs. real exported documents.
 *
 * The unit tests build tiny in-memory fixtures, so a field the exporter starts
 * emitting (or stops emitting) can still break every real character. This
 * decodes a spread of exported folders whenever an export is available.
 *
 * Point `FRAME_DATA_ROOT` at an export root (the directory holding
 * `characters/`); without it the test looks for `./unpacked` and skips when the
 * export is absent, which is the normal case for a checkout without data.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { CharacterDocumentSchema } from "../boundary/schema"
import { DEFAULT_PIXELS_PER_UNIT } from "../kernel/atlas"
import { clipBoundsFrames, fitClipView } from "../kernel/preview"
import type { CharacterDocument } from "../kernel/types"

const decode = Schema.decodeUnknownSync(CharacterDocumentSchema)

const dataRoot = resolve(process.env.FRAME_DATA_ROOT ?? "unpacked")
const charactersRoot = existsSync(join(dataRoot, "models", "catalog.json"))
	? join(dataRoot, "models")
	: existsSync(join(dataRoot, "characters"))
		? join(dataRoot, "characters")
		: dataRoot
const SPREAD = 12

/** First few, every n-th, and the last few exported characters. */
const sampleDocuments = (): string[] => {
	if (!existsSync(charactersRoot)) return []
	const ids = readdirSync(charactersRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((id) => existsSync(join(charactersRoot, id, "character.json")))
		.sort()
	if (ids.length <= SPREAD)
		return ids.map((id) => join(charactersRoot, id, "character.json"))
	const step = Math.max(1, Math.floor(ids.length / SPREAD))
	const picked = new Set<string>()
	for (let index = 0; index < ids.length; index += step) {
		const id = ids[index]
		if (id !== undefined) picked.add(id)
	}
	for (const id of ids.slice(-3)) picked.add(id)
	return [...picked]
		.sort()
		.map((id) => join(charactersRoot, id, "character.json"))
}

describe.skipIf(sampleDocuments().length === 0)("exported documents", () => {
	it("decode against the boundary schema", () => {
		const documents = sampleDocuments()
		expect(documents.length).toBeGreaterThan(0)
		for (const path of documents) {
			const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
			try {
				decode(raw)
			} catch (error) {
				throw new Error(`${path}: ${(error as Error).message.slice(0, 1200)}`)
			}
		}
	})

	/**
	 * A real sprite's pivot can sit outside its own rect, and a layer's position
	 * can carry a pose a long way from the character's origin. The box a tile is
	 * sized to is the union of what every frame draws, so it has to cover the
	 * motion — but a box that spans an atlas page would shrink the character to
	 * nothing. Measure every clip of a spread of real characters and require
	 * the fitted artwork to remain visible and contained in the viewport.
	 */
	it("measure every clip at a size the viewer can actually show", () => {
		const tile = [150, 120] as const
		for (const path of sampleDocuments()) {
			const document = decode(
				JSON.parse(readFileSync(path, "utf8")),
			) as unknown as CharacterDocument
			for (const clip of document.clips) {
				const bounds = clipBoundsFrames(document, clip)
				if (bounds === undefined) continue
				const fit = fitClipView({
					bounds,
					box: tile,
					maxPixelsPerUnit: 400,
					paddingRatio: 0.98,
					ratio: 1,
					mode: "fit",
					zoom: 1,
				})
				// A measured box counts art pixels, so it is scaled by
				// `pixelsPerUnit / DEFAULT_PIXELS_PER_UNIT` to land in canvas
				// pixels.
				const scale = fit.pixelsPerUnit / DEFAULT_PIXELS_PER_UNIT
				const drawnWidth = bounds[2] * scale
				const drawnHeight = bounds[3] * scale
				expect(
					Math.max(drawnWidth, drawnHeight),
					`${path} ${clip.name}: drawn ${drawnWidth}x${drawnHeight}`,
				).toBeGreaterThan(20)
				expect(drawnWidth).toBeLessThanOrEqual(tile[0] + 1)
				expect(drawnHeight).toBeLessThanOrEqual(tile[1] + 1)
				// Travel can span more than an atlas page. Atlas dimensions bound
				// source rectangles, not a clip's world-space motion.
				expect(bounds.every(Number.isFinite)).toBe(true)
			}
		}
	})
})

/**
 * `voices` is optional in both directions: a document exported before the field
 * existed must still decode, and one that carries it must keep it (`decode` strips
 * what the schema does not declare, so a missing field is a silent data loss).
 */
describe("character voices", () => {
	const document = {
		schemaVersion: 1,
		id: "test0001",
		name: null,
		sourceGroup: "characters",
		sourceBundle: "bundles/demo/test0001",
		atlases: [],
		sprites: [],
		clips: [],
		sounds: [],
		layers: [],
		audio: { events: 2, resolved: 0, unresolved: 2 },
		stats: { sprites: 0, clips: 0, soundEvents: 2, maxClipMs: 0 },
	}

	it("keeps the voices a document carries", () => {
		const decoded = decode({
			...document,
			voices: [
				{ name: "voice_a", slot: 0, event: "event:/sfx/demo/voice_a" },
				{ name: "voice_b", slot: 3, event: "event:/sfx/demo/voice_b" },
			],
		}) as unknown as CharacterDocument
		expect(decoded.voices).toEqual([
			{ name: "voice_a", slot: 0, event: "event:/sfx/demo/voice_a" },
			{ name: "voice_b", slot: 3, event: "event:/sfx/demo/voice_b" },
		])
	})

	it("decodes a document written before voices existed", () => {
		const decoded = decode(document) as unknown as CharacterDocument
		expect(decoded.voices).toBeUndefined()
	})

	it("rejects a voice without an event", () => {
		expect(() =>
			decode({ ...document, voices: [{ name: "a", slot: 0 }] }),
		).toThrow()
	})

	it("preserves optional display reductions and rejects invalid values", () => {
		const clip = {
			name: "sample",
			sampleRate: 30,
			frameCount: 1,
			durationMs: 1000 / 30,
			tracks: [],
			constants: {},
		}
		expect(
			decode({
				...document,
				schemaVersion: 2,
				clips: [{ ...clip, displayScale: 0.8 }],
			}).clips[0]?.displayScale,
		).toBe(0.8)
		expect(
			decode({ ...document, clips: [clip] }).clips[0]?.displayScale,
		).toBeUndefined()
		for (const value of [0, -1, 1.01, Infinity, NaN, "0.8"]) {
			expect(() =>
				decode({ ...document, clips: [{ ...clip, displayScale: value }] }),
			).toThrow()
		}
	})
})
