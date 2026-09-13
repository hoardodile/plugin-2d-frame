import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { CharacterDocumentSchema } from "../boundary/schema"
import { dueEvents } from "../kernel/events"
import { frameLayers, layerBox } from "../kernel/preview"
import { layersAt } from "../kernel/timeline"
import type { CharacterDocument, Clip, CurveTrack } from "../kernel/types"

const curve = (kind: string, values: readonly number[]): CurveTrack => ({
	layer: "body",
	kind,
	curves: values.map((value) => [[0, value]]),
})
const clip: Clip = {
	name: "idle",
	group: "idle",
	sampleRate: 20,
	frameCount: 4,
	durationMs: 200,
	tracks: [
		{
			layer: "body",
			kind: "sprite",
			keys: [
				[0, "tile"],
				[100, null],
			],
		},
		curve("matrix", [-1, 0, 0.5, 1, 2, 3]),
		curve("opacity", [0.5]),
		curve("color", [1, 0.5, 0.25]),
		curve("order", [8]),
		curve("position", [999, 999, 0]),
	],
	constants: {},
}
const document: CharacterDocument = {
	schemaVersion: 2,
	id: "test0002",
	name: "Sample",
	sourceGroup: "demo",
	sourceBundle: "sample",
	atlases: [{ file: "atlas.png", width: 100, height: 100 }],
	sprites: [
		{
			name: "tile",
			atlas: "atlas.png",
			rect: [0, 0, 100, 100],
			pivot: [0, 0],
			pixelsToUnit: 100,
		},
	],
	clips: [clip],
	sounds: [],
	layers: [{ name: "body", sortingLayer: 0, sortingOrder: 0, z: 0 }],
	audio: { events: 0, resolved: 0, unresolved: 0 },
	stats: { sprites: 1, clips: 1, soundEvents: 0, maxClipMs: 200 },
}

describe("frame format v2", () => {
	it("decodes the extension and rejects malformed matrix dimensions", () => {
		const decode = Schema.decodeUnknownSync(CharacterDocumentSchema)
		expect(decode(document).schemaVersion).toBe(2)
		expect(() =>
			decode({
				...document,
				clips: [{ ...clip, tracks: [curve("matrix", [1, 0])] }],
			}),
		).toThrow()
		expect(() => decode({ ...document, schemaVersion: 3 })).toThrow()
		expect(() =>
			decode({
				...document,
				clips: [
					{ ...clip, tracks: [curve("matrix", [1, 0, 0, 1, Infinity, 0])] },
				],
			}),
		).toThrow()
	})
	it("uses affine transforms for mirrored, sheared bounds and inspector values", () => {
		const layer = layersAt(document, clip, 0)[0]!
		expect(layer.position).toEqual([2, 3])
		expect(layer.opacity).toBe(0.5)
		expect(layer.color).toEqual([1, 0.5, 0.25])
		expect(layer.order).toBe(8)
		expect(layerBox(layer, 100)).toEqual([100, -400, 150, 100])
		expect(frameLayers(document, clip, 0)[0]?.matrix).toEqual([
			-1, 0, 0.5, 1, 2, 3,
		])
		expect(layersAt(document, clip, 100)).toEqual([])
	})
	it("keeps version one transforms and ignores extension styling", () => {
		const layer = layersAt({ ...document, schemaVersion: 1 }, clip, 0)[0]!
		expect(layer.position).toEqual([999, 999])
		expect(layer.matrix).toBeUndefined()
		expect(layer.opacity).toBeUndefined()
	})
	it("hides transparent and singular layers", () => {
		expect(
			layersAt(
				document,
				{
					...clip,
					tracks: [
						...clip.tracks.filter((t) => t.kind !== "opacity"),
						curve("opacity", [0]),
					],
				},
				0,
			),
		).toEqual([])
		expect(
			layersAt(
				document,
				{
					...clip,
					tracks: [
						...clip.tracks.filter((t) => t.kind !== "matrix"),
						curve("matrix", [1, 2, 2, 4, 0, 0]),
					],
				},
				0,
			),
		).toEqual([])
	})
	it("fires frame zero on start and wrap, without replaying it during the same interval", () => {
		const sounds = [
			{
				name: "idle",
				frames: [
					{ frame: 0, events: ["start"] },
					{ frame: 3, events: ["tail"] },
				],
			},
		]
		expect(dueEvents(sounds, clip, -0.001, 10).map((e) => e.event)).toEqual([
			"start",
		])
		expect(dueEvents(sounds, clip, 10, 30)).toEqual([])
		expect(dueEvents(sounds, clip, 170, 10).map((e) => e.event)).toEqual([
			"start",
		])
	})
})
