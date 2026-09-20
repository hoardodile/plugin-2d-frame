import type { CharacterDocument, Clip } from "../kernel/types"

const clip = (name: string, width: number, durationMs: number): Clip => ({
	name,
	group: "attack",
	sampleRate: 10,
	frameCount: durationMs / 100,
	durationMs,
	tracks: [{ layer: "body", kind: "sprite", keys: [[0, "tile"]] }],
	constants: { body: { scale: [width, 1, 1] } },
})
const origin = (clipName: string) => [{ characterId: "test0001", clipName }]

export const variantFixture: CharacterDocument = {
	schemaVersion: 2,
	id: "test0001",
	name: "Example",
	sourceGroup: "characters",
	sourceBundle: "synthetic",
	modelSources: [{ id: "test0001", name: "Example" }],
	atlases: [{ file: "atlas.png", width: 10, height: 10 }],
	sprites: [
		{
			name: "tile",
			atlas: "atlas.png",
			rect: [0, 0, 10, 10],
			pivot: [0, 0],
			pixelsToUnit: 100,
		},
	],
	layers: [{ name: "body", sortingLayer: 0, sortingOrder: 0, z: 0 }],
	clips: [
		clip("a", 1, 1000),
		clip("b", 2, 2000),
		{ ...clip("idle", 1, 1000), group: "idle" },
	],
	actions: [
		{
			id: "attack",
			name: "Attack",
			group: "attack",
			added: false,
			variants: [
				{
					clip: "a",
					sources: origin("a"),
					sounds: [
						{ name: "a-quiet", sources: origin("a") },
						{ name: "a-loud", sources: origin("a") },
					],
				},
				{
					clip: "b",
					sources: origin("b"),
					sounds: [{ name: "b", sources: origin("b") }],
				},
			],
		},
		{
			id: "idle",
			name: "Idle",
			group: "idle",
			added: false,
			variants: [
				{
					clip: "idle",
					sources: origin("idle"),
					sounds: [{ name: "idle", sources: origin("idle") }],
				},
			],
		},
	],
	sounds: [
		{ name: "a-quiet", frames: [] },
		{ name: "a-loud", frames: [{ frame: 0, events: ["hit"] }] },
		{ name: "b", frames: [] },
		{ name: "idle", frames: [] },
	],
	audio: { events: 1, resolved: 0, unresolved: 1 },
	stats: { sprites: 1, clips: 3, actions: 2, soundEvents: 1, maxClipMs: 2000 },
}
