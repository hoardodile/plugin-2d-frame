/**
 * Generate `testdata/` — a tiny synthetic character export.
 *
 * The workbench serves one self-contained folder, so the committed fixture is a
 * minimal but *valid* export: a 64x64 atlas with four sprites, three clips
 * (`idle_loop`, `attack_slash`, `hide`) and one sound event. Every name here is
 * invented — the fixture must not carry any real export's naming convention.
 * `pnpm testdata` regenerates it.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "testdata")

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
	let value = index
	for (let bit = 0; bit < 8; bit += 1) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
	}
	return value >>> 0
})

const crc32 = (buffer) => {
	let crc = 0xffffffff
	for (const byte of buffer) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
	}
	return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
	const length = Buffer.alloc(4)
	length.writeUInt32BE(data.length)
	const body = Buffer.concat([Buffer.from(type, "ascii"), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(body))
	return Buffer.concat([length, body, crc])
}

/** Minimal RGBA PNG encoder (no dependencies). */
const encodePng = (width, height, pixel) => {
	const raw = Buffer.alloc((width * 4 + 1) * height)
	for (let y = 0; y < height; y += 1) {
		const rowStart = y * (width * 4 + 1)
		raw[rowStart] = 0
		for (let x = 0; x < width; x += 1) {
			const [r, g, b, a] = pixel(x, y)
			const offset = rowStart + 1 + x * 4
			raw[offset] = r
			raw[offset + 1] = g
			raw[offset + 2] = b
			raw[offset + 3] = a
		}
	}
	const header = Buffer.alloc(13)
	header.writeUInt32BE(width, 0)
	header.writeUInt32BE(height, 4)
	header[8] = 8 // bit depth
	header[9] = 6 // RGBA
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	])
}

const ATLAS_WIDTH = 64
const ATLAS_HEIGHT = 64

/** Four 32x32 cells, laid out two per row. */
const FRAMES = [
	{ name: "frame_idle_0", x: 0, y: 0, color: [70, 130, 220, 255] },
	{ name: "frame_idle_1", x: 32, y: 0, color: [70, 180, 220, 255] },
	{ name: "frame_hit_0", x: 0, y: 32, color: [220, 110, 90, 255] },
	{ name: "frame_hit_1", x: 32, y: 32, color: [240, 160, 90, 255] },
]

const frameAt = (x, y) =>
	FRAMES.find(
		(frame) =>
			x >= frame.x && x < frame.x + 32 && y >= frame.y && y < frame.y + 32,
	)

const png = encodePng(ATLAS_WIDTH, ATLAS_HEIGHT, (x, y) => {
	const frame = frameAt(x, y)
	if (frame === undefined) return [0, 0, 0, 0]
	const inside =
		x > frame.x + 3 && x < frame.x + 29 && y > frame.y + 3 && y < frame.y + 26
	return inside ? frame.color : [255, 255, 255, 255]
})

const spriteOf = (frame) => ({
	name: frame.name,
	atlas: "test-atlas.png",
	rect: [frame.x, ATLAS_HEIGHT - frame.y - 32, 32, 32],
	pivot: [0.5, 0.0],
	pixelsToUnit: 100,
})

const spriteTrack = (keys) => ({ layer: "layer0", kind: "sprite", keys })

const document = {
	schemaVersion: 1,
	id: "test0001",
	name: "Demo Character",
	sourceGroup: "characters",
	sourceBundle: "testdata/synthetic",
	sourceFormat: { container: "asset-bundle", version: 8 },
	atlases: [
		{ file: "atlas/test-atlas.png", width: ATLAS_WIDTH, height: ATLAS_HEIGHT },
	],
	sprites: FRAMES.map(spriteOf),
	clips: [
		{
			name: "idle_loop",
			group: "idle",
			sampleRate: 30,
			frameCount: 4,
			durationMs: 133.33,
			tracks: [
				spriteTrack([
					[0, "frame_idle_0"],
					[33.33, "frame_idle_1"],
					[66.67, "frame_idle_0"],
					[100, "frame_idle_1"],
				]),
			],
			constants: {
				layer0: { position: [0, 0, 0], scale: [1, 1, 1], euler: [0, 0, 0] },
			},
		},
		{
			name: "attack_slash",
			group: "attack",
			sampleRate: 30,
			frameCount: 3,
			durationMs: 100,
			tracks: [
				spriteTrack([
					[0, "frame_hit_0"],
					[33.33, "frame_hit_1"],
					[66.67, null],
				]),
				{
					layer: "layer0",
					kind: "position",
					curves: [
						[
							[0, 0],
							[33.33, 6],
							[66.67, 0],
						],
						[
							[0, 0],
							[33.33, 2],
							[66.67, 0],
						],
						[[0, 0]],
					],
				},
			],
			constants: { layer0: { scale: [1, 1, 1], euler: [0, 0, 0] } },
		},
		{
			name: "hide",
			group: "state",
			sampleRate: 30,
			frameCount: 1,
			durationMs: 33.33,
			tracks: [spriteTrack([[0, null]])],
			constants: {},
		},
	],
	sounds: [
		{
			name: "attack_slash",
			frames: [{ frame: 1, events: ["event:/sfx/demo/hit_01"] }],
		},
	],
	voices: [
		{ name: "voice_a", slot: 0, event: "event:/sfx/demo/voice_a" },
		{ name: "voice_b", slot: 3, event: "event:/sfx/demo/voice_b" },
	],
	layers: [{ name: "layer0", sortingOrder: 0, sortingLayer: 0, z: 0 }],
	points: [{ name: "layer0", position: [0, 0, 0] }],
	audio: { events: 3, resolved: 0, unresolved: 3 },
	stats: { sprites: 4, clips: 3, soundEvents: 3, maxClipMs: 133.33 },
}

const audioMap = [
	{ event: "event:/sfx/demo/hit_01", file: null, match: "unresolved" },
	{ event: "event:/sfx/demo/voice_a", file: null, match: "unresolved" },
	{ event: "event:/sfx/demo/voice_b", file: null, match: "unresolved" },
]

// Opt-in fixture for affine/style regression and manual preview checks.
const exportDocument = process.argv.includes("--v2")
	? {
			...document,
			schemaVersion: 2,
			clips: document.clips.map((clip) => ({
				...clip,
				displayScale: 0.8,
				tracks: [
					...clip.tracks,
					{
						layer: "layer0",
						kind: "matrix",
						curves: [1, 0, 0.25, 1, 0, 0].map((value) => [[0, value]]),
					},
					{ layer: "layer0", kind: "opacity", curves: [[[0, 0.75]]] },
					{
						layer: "layer0",
						kind: "color",
						curves: [1, 0.75, 1].map((value) => [[0, value]]),
					},
					{ layer: "layer0", kind: "order", curves: [[[0, 0]]] },
				],
			})),
		}
	: document

/** Optional model fixture; the default keeps exercising legacy documents. */
const withVariants = (base) => {
	const attack = base.clips.find((clip) => clip.name === "attack_slash")
	const alternate = {
		...attack,
		name: "attack_alternate",
		frameCount: attack.frameCount * 2,
		durationMs: attack.durationMs * 2,
	}
	const origin = (clipName, characterId = "test0001") => [
		{ characterId, clipName },
	]
	const sounds = base.clips.map(
		(clip) =>
			base.sounds.find((sound) => sound.name === clip.name) ?? {
				name: clip.name,
				frames: [],
			},
	)
	return {
		...base,
		schemaVersion: 2,
		modelSources: [
			{ id: "test0001", name: "Demo Character" },
			{ id: "test0002", name: "Demo Character" },
		],
		clips: [...base.clips, alternate],
		sounds: [...sounds, { name: alternate.name, frames: [] }],
		actions: base.clips.map((clip) => ({
			id: clip.name,
			name: clip.name,
			group: clip.group,
			added: clip.name === "hide",
			variants: [
				{
					clip: clip.name,
					sources: origin(clip.name),
					sounds: [{ name: clip.name, sources: origin(clip.name) }],
				},
				...(clip.name === "attack_slash"
					? [
							{
								clip: alternate.name,
								sources: origin(alternate.name, "test0002"),
								sounds: [
									{
										name: alternate.name,
										sources: origin(alternate.name, "test0002"),
									},
								],
							},
						]
					: []),
			],
		})),
		stats: {
			...base.stats,
			actions: base.clips.length,
			clips: base.clips.length + 1,
			soundEvents: 3,
			maxClipMs: Math.max(base.stats.maxClipMs, alternate.durationMs),
		},
	}
}
const finalDocument = process.argv.includes("--variants")
	? withVariants(exportDocument)
	: exportDocument

mkdirSync(join(root, "atlas"), { recursive: true })
writeFileSync(join(root, "atlas", "test-atlas.png"), png)
writeFileSync(
	join(root, "character.json"),
	JSON.stringify(finalDocument, null, "\t"),
)
writeFileSync(
	join(root, "audio-map.json"),
	JSON.stringify(audioMap, null, "\t"),
)
writeFileSync(
	join(root, "README.md"),
	[
		"# Synthetic character fixture",
		"",
		"Generated by `node scripts/make-testdata.mjs` (also `pnpm testdata`).",
		"A minimal but valid character export: a 64x64 atlas with four sprites,",
		"three clips (`idle_loop`, `attack_slash`, `hide`), one sound event and two",
		"character voices, all invented for the fixture.",
		"",
		"`pnpm dev` serves this folder as one resource. The format is documented in",
		"`docs/format.md`.",
		"",
	].join("\n"),
)

// `JSON.stringify` cannot reproduce Biome's line-width decisions (it expands
// every array), and `biome check .` covers `testdata/`, so hand the JSON to Biome
// rather than committing a fixture that `pnpm lint` immediately wants to rewrite.
// `bin/biome` is a JS launcher, so run it with the current node — spawning the
// `.cmd` shim would need a shell (and Node refuses that without one).
const biome = join(
	here,
	"..",
	"node_modules",
	"@biomejs",
	"biome",
	"bin",
	"biome",
)
if (existsSync(biome)) {
	const result = spawnSync(
		process.execPath,
		[biome, "check", "--write", root],
		{
			stdio: "inherit",
		},
	)
	if (result.status !== 0) {
		console.error("warning: could not format testdata/ with biome")
	}
}

console.log(`wrote testdata fixture to ${root}`)
