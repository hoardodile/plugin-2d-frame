import { describe, expect, it } from "vitest"

import { quadFor } from "../kernel/atlas"
import type { Box } from "../kernel/preview"
import {
	clipBoundsFrames,
	clipDisplayScale,
	clipViewPixelsPerUnit,
	fitClipView,
	fitViewport,
	frameLayers,
	frameStripIndices,
	layerBox,
	quantizeFit,
} from "../kernel/preview"
import { layersAt } from "../kernel/timeline"
import type { CharacterDocument, Clip, SpriteRecord } from "../kernel/types"

const sprite = (name: string, x: number, y: number): SpriteRecord => ({
	name,
	atlas: "atlas.png",
	rect: [x, y, 32, 32],
	pivot: [0.5, 0],
	pixelsToUnit: 100,
})

/** One 32×32 sprite, one layer, no transforms: a known 32×32 draw box. */
const clipAt = (
	name: string,
	keys: readonly (readonly [number, string | null])[],
): Clip => ({
	name,
	sampleRate: 30,
	frameCount: keys.length,
	durationMs: (keys.length / 30) * 1000,
	tracks: [{ layer: "layer0", kind: "sprite", keys }],
	constants: {},
})

const documentOf = (clips: readonly Clip[]): CharacterDocument => ({
	schemaVersion: 1,
	id: "test",
	name: null,
	sourceGroup: "characters",
	sourceBundle: "testdata/synthetic",
	atlases: [{ file: "atlas/atlas.png", width: 64, height: 64 }],
	sprites: [sprite("a", 0, 32), sprite("b", 32, 32)],
	clips,
	sounds: [],
	layers: [{ name: "layer0", sortingOrder: 0, sortingLayer: 0, z: 0 }],
	audio: { events: 0, resolved: 0, unresolved: 0 },
	stats: { sprites: 2, clips: clips.length, soundEvents: 0, maxClipMs: 100 },
})

const document = documentOf([
	clipAt("idle_loop", [
		[0, "a"],
		[33.33, "b"],
	]),
])

/** A clip whose only motion is a position curve on its one layer. */
const movedDocument = (distance = 16): CharacterDocument =>
	documentOf([
		{
			...clipAt("moved", [
				[0, "a"],
				[33.33, "b"],
			]),
			tracks: [
				{
					layer: "layer0",
					kind: "sprite",
					keys: [
						[0, "a"],
						[33.33, "b"],
					],
				},
				{
					layer: "layer0",
					kind: "position",
					curves: [
						[
							[0, 0],
							[33.33, distance],
						],
						[[0, 0]],
						[[0, 0]],
					],
				},
			],
		},
	])

describe("layer boxes", () => {
	it("measures the rectangle the painter blits", () => {
		// pivot [0.5, 0] on a 32×32 rect: the draw sits 16 left and 32 up of the
		// pivot, and the pivot itself is placed by the layer's position — so the
		// drawn rect is `pivot + quad`, which is what a frame box has to be.
		const clip = document.clips[0]!
		const layer = layersAt(document, clip, 0)[0]!
		const quad = quadFor(layer.sprite, layer.position, layer.scale, 100)
		expect(layerBox(layer, 100)).toEqual([
			quad.pivotX + quad.left,
			quad.pivotY + quad.top,
			quad.width,
			quad.height,
		])
		expect(layerBox(layer, 100)).toEqual([-16, -32, 32, 32])
	})

	it("follows the layer's position instead of ignoring it", () => {
		// The position is where the animation puts the pivot — a frame box that
		// leaves it out frames the artwork's *shape*, not where it is drawn, and
		// every tile ends up showing a corner of its own pose.
		const moved = movedDocument()
		const clip = moved.clips[0]!
		const start = layersAt(moved, clip, 0)[0]!
		const end = layersAt(moved, clip, 33.33)[0]!
		expect(layerBox(start, 100)).toEqual([-16, -32, 32, 32])
		// 16 world units = 1600 art pixels to the right.
		expect(layerBox(end, 100)).toEqual([1584, -32, 32, 32])
	})
})

describe("clip bounds", () => {
	it("measures the frame the sprite actually covers", () => {
		// pivot [0.5, 0] on a 32×32 rect: the draw sits 16 left and 32 up.
		const bounds = clipBoundsFrames(document, document.clips[0]!)
		expect(bounds).toEqual([-16, -32, 32, 32])
	})

	it("unions every frame of a moving clip into one box", () => {
		// Frame 0 sits at the origin and frame 1 at x=16, so the animation's box
		// spans both: a tile is sized to this box, and a frame is drawn at 1:1
		// inside it, so a box around a single pose would crop the other.
		const moved = movedDocument()
		expect(clipBoundsFrames(moved, moved.clips[0]!)).toEqual([
			-16, -32, 1632, 32,
		])
	})

	it("fits long travel even when the bounds exceed the atlas page", () => {
		const moved = movedDocument(50)
		const clip = moved.clips[0]!
		const bounds = clipBoundsFrames(moved, clip)!
		expect(bounds).toEqual([-16, -32, 5032, 32])
		const fit = fitViewport({
			bounds,
			box: [150, 120],
			maxPixelsPerUnit: 400,
			paddingRatio: 1,
		})
		const scale = fit.pixelsPerUnit / 100
		for (const frame of [0, 1000 / 30]) {
			for (const layer of layersAt(moved, clip, frame)) {
				const box = layerBox(layer, 100)
				expect(box[0] * scale + fit.origin[0]).toBeGreaterThanOrEqual(-1e-6)
				expect((box[0] + box[2]) * scale + fit.origin[0]).toBeLessThanOrEqual(
					150 + 1e-6,
				)
			}
		}
	})

	it("contains every frame it measures", () => {
		const moved = movedDocument()
		const clip = moved.clips[0]!
		const bounds = clipBoundsFrames(moved, clip)!
		for (const frame of [0, 16.67, 33.33]) {
			const drawn = layersAt(moved, clip, frame).map((layer) =>
				layerBox(layer, 100),
			)
			for (const box of drawn) {
				expect(box[0]).toBeGreaterThanOrEqual(bounds[0])
				expect(box[1]).toBeGreaterThanOrEqual(bounds[1])
				expect(box[0] + box[2]).toBeLessThanOrEqual(bounds[0] + bounds[2])
				expect(box[1] + box[3]).toBeLessThanOrEqual(bounds[1] + bounds[3])
			}
		}
	})

	it("unions per-frame boxes when the pose itself changes", () => {
		// A scale key is a real change of extent, so frame 1 must widen the box.
		const growing = documentOf([
			{
				...clipAt("growing", [
					[0, "a"],
					[33.33, "a"],
				]),
				tracks: [
					{
						layer: "layer0",
						kind: "sprite",
						keys: [
							[0, "a"],
							[33.33, "a"],
						],
					},
					{
						layer: "layer0",
						kind: "scale",
						curves: [
							[
								[0, 1],
								[33.33, 2],
							],
							[
								[0, 1],
								[33.33, 2],
							],
							[[0, 1]],
						],
					},
				],
			},
		])
		// Doubled width and height, measured about the pivot: frame 1 spans
		// -32..32 in x and -64..0 in y.
		expect(clipBoundsFrames(growing, growing.clips[0]!)).toEqual([
			-32, -64, 64, 64,
		])
	})

	it("returns nothing for a clip with no drawable layer", () => {
		const empty = documentOf([{ ...clipAt("empty", [[0, null]]), tracks: [] }])
		expect(clipBoundsFrames(empty, empty.clips[0]!)).toBeUndefined()
	})
})

describe("frame layers", () => {
	it("reports the values behind the drawn layers, in draw order", () => {
		const layers = frameLayers(document, document.clips[0]!, 0)
		expect(layers).toHaveLength(1)
		expect(layers[0]?.layer).toBe("layer0")
		expect(layers[0]?.sprite).toBe("a")
		expect(layers[0]?.position).toEqual([0, 0])
		expect(layers[0]?.scale).toEqual([1, 1])
		expect(layers[0]?.size).toEqual([32, 32])
	})

	it("follows the sprite keys as the playhead advances", () => {
		expect(frameLayers(document, document.clips[0]!, 50)[0]?.sprite).toBe("b")
	})
})

/** The drawn rectangle of a frame: `origin + bounds`, all at `pixelsPerUnit`. */
const drawnRect = (
	bounds: Box,
	origin: readonly [number, number],
	pixelsPerUnit: number,
): Box => {
	const factor = pixelsPerUnit / 100
	return [
		origin[0] + bounds[0] * factor,
		origin[1] + bounds[1] * factor,
		bounds[2] * factor,
		bounds[3] * factor,
	]
}

describe("viewport fitting", () => {
	it("centres the drawn frame in the box and keeps it inside", () => {
		const fit = fitViewport({
			bounds: [-16, -32, 32, 32],
			box: [200, 200],
			maxPixelsPerUnit: 400,
			paddingRatio: 1,
		})
		// 200/32 art units per pixel is 625 px/unit, capped to 400.
		expect(fit.pixelsPerUnit).toBe(400)
		const drawn = drawnRect([-16, -32, 32, 32], fit.origin, fit.pixelsPerUnit)
		expect(drawn[0]).toBeCloseTo(36)
		expect(drawn[1]).toBeCloseTo(36)
		expect(drawn[0] + drawn[2]).toBeCloseTo(164)
		expect(drawn[1] + drawn[3]).toBeCloseTo(164)
		// Centred: the slack is split evenly on both sides.
		expect(drawn[0]).toBeCloseTo(200 - (drawn[0] + drawn[2]))
		expect(drawn[1]).toBeCloseTo(200 - (drawn[1] + drawn[3]))
	})

	it("caps the scale so a tiny frame is not blown up", () => {
		const fit = fitViewport({
			bounds: [0, 0, 1, 1],
			box: [1000, 1000],
			maxPixelsPerUnit: 400,
			paddingRatio: 1,
		})
		expect(fit.pixelsPerUnit).toBe(400)
	})

	it("stays finite for an empty box", () => {
		const fit = fitViewport({
			bounds: [0, 0, 0, 0],
			box: [100, 100],
			maxPixelsPerUnit: 400,
			paddingRatio: 1,
		})
		expect(Number.isFinite(fit.pixelsPerUnit)).toBe(true)
		expect(fit.pixelsPerUnit).toBeGreaterThan(0)
	})
})

describe("thumbnail scale", () => {
	it("preserves authored size for old documents and when reduction is disabled", () => {
		const clip = document.clips[0]!
		expect(clipDisplayScale(clip)).toBe(1)
		expect(clipDisplayScale({ ...clip, displayScale: 0.8 })).toBe(0.8)
		expect(clipDisplayScale({ ...clip, displayScale: 0.8 }, false)).toBe(1)
	})

	it("reduces and centres the whole frame without changing its authored bounds", () => {
		const bounds: Box = [-40, -100, 125, 200]
		const view = fitClipView({
			bounds,
			displayScale: 0.8,
			box: [100, 160],
			maxPixelsPerUnit: 100,
			paddingRatio: 1,
			ratio: 1,
			mode: "exact",
			zoom: 1,
		})
		expect(view.pixelsPerUnit).toBe(80)
		expect(drawnRect(bounds, view.origin, view.pixelsPerUnit)).toEqual([
			0, 0, 100, 160,
		])
		expect(bounds).toEqual([-40, -100, 125, 200])
	})

	it("fits using the reduced size before quantizing the viewport scale", () => {
		const options = {
			bounds: [-40, -100, 125, 200] as const,
			displayScale: 0.65,
			box: [500, 500] as const,
			maxPixelsPerUnit: 100,
			paddingRatio: 1,
			ratio: 1,
			mode: "fit" as const,
			zoom: 1,
		}
		expect(fitClipView(options).pixelsPerUnit).toBe(65)
		const small = fitClipView({ ...options, displayScale: 0.8, box: [50, 80] })
		expect(small.pixelsPerUnit).toBe(40)
		expect(
			drawnRect(options.bounds, small.origin, small.pixelsPerUnit),
		).toEqual([0, 0, 50, 80])
	})

	it("never exceeds 1:1 and snaps to whole device pixels", () => {
		// A 32×32 draw in a 40×48 cell is drawn at exactly 1:1.
		expect(clipViewPixelsPerUnit([0, 0, 32, 32], [40, 48], 1)).toBe(100)
		// A 400-pixel-wide draw in the same cell is scaled down, exactly.
		expect(clipViewPixelsPerUnit([0, 0, 400, 400], [40, 48], 1)).toBe(10)
	})

	it("fills the box with a fitted frame and centres it", () => {
		const view = fitClipView({
			bounds: [-16, -32, 32, 32],
			box: [400, 300],
			maxPixelsPerUnit: 800,
			paddingRatio: 1,
			ratio: 1,
			mode: "fit",
			zoom: 1,
		})
		// The frame fills the box: 300/32 art units is 937.5 px/unit, capped at
		// 800 — one art pixel per 8 device pixels.
		expect(view.pixelsPerUnit).toBe(800)
		expect(view.effectiveScale).toBe(8)
		const drawn = drawnRect([-16, -32, 32, 32], view.origin, view.pixelsPerUnit)
		expect(drawn[0]).toBeGreaterThanOrEqual(0)
		expect(drawn[1]).toBeGreaterThanOrEqual(0)
		expect(drawn[0] + drawn[2]).toBeLessThanOrEqual(400)
		expect(drawn[1] + drawn[3]).toBeLessThanOrEqual(300)
		// Centred: the slack is split evenly on both sides.
		expect(drawn[0]).toBeCloseTo(400 - (drawn[0] + drawn[2]))
		expect(drawn[1]).toBeCloseTo(300 - (drawn[1] + drawn[3]))
	})

	it("places a tile by mapping its measured box onto the tile", () => {
		// How the preview composes a tile: the canvas is the clip's whole-frame
		// box in art pixels and the frame is drawn 1:1, centred by moving the
		// origin. The origin maps the bounds corners onto the tile, so the drawn
		// rect is the tile — the "every tile is blank" bug was drawing this frame
		// at twice its intended offset, which landed the whole character outside
		// the canvas.
		const bounds = [-47, -118, 94, 122] as const
		const width = Math.round(bounds[2])
		const height = Math.round(bounds[3])
		const origin: readonly [number, number] = [
			(width - bounds[2]) / 2 - bounds[0],
			(height - bounds[3]) / 2 - bounds[1],
		]
		// origin + bounds spans exactly the tile.
		expect(origin[0] + bounds[0]).toBeCloseTo(0)
		expect(origin[1] + bounds[1]).toBeCloseTo(0)
		expect(origin[0] + bounds[0] + bounds[2]).toBeCloseTo(width)
		expect(origin[1] + bounds[1] + bounds[3]).toBeCloseTo(height)
		// And the frame's own quad is inside that box, so it cannot be clipped.
		const drawn = drawnRect(bounds, origin, 100)
		expect(drawn[0]).toBeGreaterThanOrEqual(0)
		expect(drawn[1]).toBeGreaterThanOrEqual(0)
		expect(drawn[0] + drawn[2]).toBeLessThanOrEqual(width)
		expect(drawn[1] + drawn[3]).toBeLessThanOrEqual(height)
	})

	it("fits a smaller box down rather than drawing past it", () => {
		// The inspector asks for a fit; a box smaller than the artwork scales it
		// down so it stays inside — 47/94 and 61/122 are both one half, so the
		// frame lands on the box exactly.
		const view = fitClipView({
			bounds: [-47, -118, 94, 122],
			box: [47, 61],
			maxPixelsPerUnit: Number.MAX_SAFE_INTEGER,
			paddingRatio: 1,
			ratio: 1,
			mode: "fit",
			zoom: 1,
		})
		expect(view.pixelsPerUnit).toBe(50)
		const drawn = drawnRect(
			[-47, -118, 94, 122],
			view.origin,
			view.pixelsPerUnit,
		)
		expect(drawn[0]).toBeCloseTo(0)
		expect(drawn[1]).toBeCloseTo(0)
		expect(drawn[2]).toBeCloseTo(47)
		expect(drawn[3]).toBeCloseTo(61)
	})

	it("honours an exact zoom, and keeps the drawn frame centred", () => {
		const oneToOne = fitClipView({
			bounds: [-16, -32, 32, 32],
			box: [400, 300],
			maxPixelsPerUnit: 800,
			paddingRatio: 1,
			ratio: 1,
			mode: "exact",
			zoom: 1,
		})
		expect(oneToOne.pixelsPerUnit).toBe(100)
		expect(oneToOne.effectiveScale).toBe(1)
		// Bounds centre is (0, -16), so at 1:1 the drawn rect lands at
		// 184..216 in x and 134..166 in y, centred in the box.
		const centreOf = (view: {
			readonly origin: readonly [number, number]
			readonly pixelsPerUnit: number
		}) => {
			const drawn = drawnRect(
				[-16, -32, 32, 32],
				view.origin,
				view.pixelsPerUnit,
			)
			return [drawn[0] + drawn[2] / 2, drawn[1] + drawn[3] / 2] as const
		}
		expect(oneToOne.origin[0]).toBeCloseTo(200)
		expect(centreOf(oneToOne)).toEqual([200, 150])

		const twice = fitClipView({
			bounds: [-16, -32, 32, 32],
			box: [400, 300],
			maxPixelsPerUnit: 800,
			paddingRatio: 1,
			ratio: 1,
			mode: "exact",
			zoom: 2,
		})
		expect(twice.pixelsPerUnit).toBe(200)
		expect(twice.effectiveScale).toBe(2)
		// Zooming keeps the drawn frame on the same centre instead of jumping.
		const centre = centreOf(twice)
		expect(centre[0]).toBeCloseTo(200)
		expect(centre[1]).toBeCloseTo(150)
	})

	it("snaps a fitted scale down to the device grid", () => {
		expect(quantizeFit(100, 1)).toBe(100)
		// A scale within a couple of percent of 1:1 is the natural scale with a
		// rounding error in it, not a request to draw smaller: snapping it down
		// would shrink a preview tile to a fraction of its frame.
		expect(quantizeFit(99, 1)).toBe(100)
		expect(quantizeFit(94.000004 / 0.94, 1)).toBe(100)
		// 1.504 device pixels per art pixel is 50% away from the nearest exact
		// scale, and shrinking the frame that much costs more than the resampling
		// it saves, so the requested scale is kept and that blit is smoothed.
		expect(quantizeFit(150.4, 1)).toBe(150.4)
		// A nearby exact scale *is* taken: 1.2 device pixels snaps down to 1.
		expect(quantizeFit(120, 1)).toBe(100)
		// Snapping never *grows* a frame past its box.
		for (const scale of [1, 12, 150.4, 399.9, 1000]) {
			expect(quantizeFit(scale, 1)).toBeLessThanOrEqual(scale)
			expect(quantizeFit(scale, 1)).toBeGreaterThan(0)
		}
		// Below 1:1 the snap is a whole fraction: 70 px/unit becomes one art
		// pixel per two device pixels, i.e. 50 px/unit.
		expect(quantizeFit(70, 1)).toBeCloseTo(50)
	})
})

describe("frame strip sampling", () => {
	it("spans the clip and stays inside its frames", () => {
		const indices = frameStripIndices(75, 32)
		expect(indices).toHaveLength(32)
		expect(indices[0]).toBe(0)
		expect(indices.at(-1)).toBe(74)
	})

	it("collapses to the single frame when the clip is shorter than the limit", () => {
		expect(frameStripIndices(1, 32)).toEqual([0])
		expect(frameStripIndices(0, 32)).toEqual([0])
	})
})
