import { afterEach, expect, it, vi } from "vitest"

import type { Affine, CharacterDocument, Clip } from "../kernel/types"
import { captureFrame } from "../ui/cover"
import { paintClipFrame } from "../ui/paint"

afterEach(() => vi.restoreAllMocks())

const splitDocument = (matrix: Affine): CharacterDocument => {
	const clip: Clip = {
		name: "split",
		sampleRate: 30,
		frameCount: 1,
		durationMs: 1000 / 30,
		constants: {},
		tracks: ["left", "right"].flatMap((layer) => [
			{ layer, kind: "sprite", keys: [[0, layer]] },
			{ layer, kind: "matrix", curves: matrix.map((v) => [[0, v]]) },
		]),
	}
	return {
		schemaVersion: 2,
		id: "test0001",
		name: "Split artwork",
		sourceGroup: "demo",
		sourceBundle: "synthetic",
		atlases: [{ file: "atlas.png", width: 100, height: 100 }],
		sprites: [
			{
				name: "left",
				atlas: "atlas.png",
				rect: [0, 0, 30, 20],
				pivot: [0, 1],
				pixelsToUnit: 100,
			},
			{
				name: "right",
				atlas: "atlas.png",
				rect: [32, 0, 20, 20],
				// Independently serialized shared edge, just below 30 pixels.
				pivot: [-1.4999999, 1],
				pixelsToUnit: 100,
			},
		],
		layers: ["left", "right"].map((name) => ({
			name,
			sortingLayer: 0,
			sortingOrder: 0,
			z: 0,
		})),
		clips: [clip],
		sounds: [],
		audio: { events: 0, resolved: 0, unresolved: 0 },
		stats: { sprites: 2, clips: 1, soundEvents: 0, maxClipMs: 1000 / 30 },
	}
}

const paint = (matrix: Affine, ratio: number, pixelsPerUnit: number) => {
	const context = {
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		transform: vi.fn(),
		drawImage: vi.fn(),
		imageSmoothingEnabled: false,
	}
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		context as unknown as CanvasRenderingContext2D,
	)
	const doc = splitDocument(matrix)
	paintClipFrame(document.createElement("canvas"), {
		document: doc,
		clip: doc.clips[0]!,
		timeMs: 0,
		atlasImages: new Map([["atlas.png", new Image()]]),
		ratio,
		pixelsPerUnit,
		origin: [10.5 / ratio, 20.5 / ratio],
	})
	return context
}

it("captures at source density with tight bounds and preserves joined pieces", () => {
	const context = paint([1, 0, 0, 1, 0, 0], 1, 100)
	const doc = splitDocument([1, 0, 0, 1, 2, 3])
	const lowDensity = {
		...doc,
		sprites: doc.sprites.map((s) => ({ ...s, pixelsToUnit: 80 })),
	}
	const output = vi
		.spyOn(HTMLCanvasElement.prototype, "toDataURL")
		.mockImplementation(function (this: HTMLCanvasElement) {
			expect(this.width).toBe(50)
			expect(this.height).toBe(20)
			return "data:image/png;base64,cG5n"
		})
	context.drawImage.mockClear()
	expect(
		captureFrame({
			document: lowDensity,
			clip: doc.clips[0]!,
			timeMs: 0,
			atlasImages: new Map([["atlas.png", new Image()]]),
			displayScale: 0.8,
		}),
	).toBe("data:image/png;base64,cG5n")
	expect(output).toHaveBeenCalledWith("image/png")
	expect(context.drawImage.mock.calls.map((args) => args.slice(-2))).toEqual([
		[30, 20],
		[20, 20],
	])
	expect(context.translate.mock.calls.slice(-2)).toEqual([
		[0, 0],
		[30, 0],
	])
})

it.each([
	[1, 100, 1],
	[1.25, 100, 1],
	[2, 100, 1],
	[1, 80, 1.25],
	[1.25, 80, 1.25],
	[1, 50, 1],
	[1, 100, -1],
	[1.25, 80, -1.25],
])(
	"joins split edges on device pixels (ratio %s, ppu %s, scale %s)",
	(ratio, ppu, scale) => {
		const ctx = paint([scale, 0, 0, scale, 0, 0], ratio, ppu)
		const [first, second] = ctx.drawImage.mock.calls
		const [start, next] = ctx.translate.mock.calls
		const sign = Math.sign(scale)
		expect(start![0] + sign * first![7]).toBeCloseTo(next![0], 10)
		for (const [index, call] of ctx.drawImage.mock.calls.entries()) {
			const [x, y] = ctx.translate.mock.calls[index]!
			for (const edge of [x, y, x + sign * call[7], y + sign * call[8]]) {
				expect(edge * ratio).toBeCloseTo(Math.round(edge * ratio), 8)
			}
		}
		expect(first!.slice(1, 5)).toEqual([0, 80, 30, 20])
		expect(second!.slice(1, 5)).toEqual([32, 80, 20, 20])
		expect(ctx.scale.mock.calls).toEqual([
			[sign, sign],
			[sign, sign],
		])
	},
)

it("preserves fractional translations through rotation and shear", () => {
	const ctx = paint([1, 0.2, 0.3, -1, 0.003, 0.007], 1, 100)
	for (const translation of ctx.translate.mock.calls) {
		expect(translation[0]).toBeCloseTo(10.8)
		expect(translation[1]).toBeCloseTo(19.8)
	}
	for (const matrix of ctx.transform.mock.calls) {
		expect(matrix).toEqual([1, -0.2, -0.3, -1, 0, 0])
	}
	expect(ctx.scale).not.toHaveBeenCalled()
})
