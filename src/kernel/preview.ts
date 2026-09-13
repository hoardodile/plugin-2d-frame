/**
 * Preview model maths.
 *
 * Pure: measure what a clip actually draws across its frames (so the viewer can
 * size a tile to the artwork instead of guessing), and place a frame inside a
 * box without ever scaling it up.
 */

import { atlasSize, DEFAULT_PIXELS_PER_UNIT, quadFor } from "./atlas"
import {
	clipDuration,
	clipFrameTotal,
	clipSpriteNames,
	createFrameSampler,
	layersAt,
	spriteByName,
} from "./timeline"
import type {
	Affine,
	CharacterDocument,
	Clip,
	LayerDraw,
	Vec2,
	Vec3,
} from "./types"

/** A rectangle in canvas pixels, y down: `[left, top, width, height]`. */
export type Box = readonly [
	left: number,
	top: number,
	width: number,
	height: number,
]

export const EMPTY_BOX: Box = [0, 0, 0, 0]

export const clipDisplayScale = (clip: Clip, reduced = true): number =>
	reduced ? (clip.displayScale ?? 1) : 1

const unionBoxes = (left: Box, right: Box): Box => {
	const x = Math.min(left[0], right[0])
	const y = Math.min(left[1], right[1])
	const x2 = Math.max(left[0] + left[2], right[0] + right[2])
	const y2 = Math.max(left[1] + left[3], right[1] + right[3])
	return [x, y, Math.max(0, x2 - x), Math.max(0, y2 - y)]
}

/**
 * The box one layer occupies in the frame, placed exactly as the painter draws
 * it: the sprite's rect, rotated about its pivot and then translated by the
 * pivot the layer's position puts on the canvas.
 *
 * The translation is the whole point. `quadFor`'s rect is pivot-relative, so
 * measuring it alone describes the *shape* a layer has, not *where the
 * animation puts it* — and a frame measured that way is a box nothing is
 * necessarily drawn inside, which is how a tile ends up showing a corner of its
 * own pose. `layerBox` therefore returns the same rectangle the blit covers:
 * `origin + layerBox` is the drawn rect, whatever `origin` places the logical
 * origin at.
 */
export const layerBox = (layer: LayerDraw, pixelsPerUnit: number): Box => {
	const quad = quadFor(layer.sprite, layer.position, layer.scale, pixelsPerUnit)
	const radians = (-layer.rotation * Math.PI) / 180
	const cos = Math.cos(radians)
	const sin = Math.sin(radians)
	const matrix = layer.matrix
	const points = matrix
		? affineCorners(layer, matrix, pixelsPerUnit)
		: [quad.left, quad.left + quad.width].flatMap((x) =>
				[quad.top, quad.top + quad.height].map((y) => ({
					x: x * cos - y * sin + quad.pivotX,
					y: x * sin + y * cos + quad.pivotY,
				})),
			)
	const xs = points.map((point) => point.x)
	const ys = points.map((point) => point.y)
	const minX = Math.min(...xs)
	const minY = Math.min(...ys)
	const maxX = Math.max(...xs)
	const maxY = Math.max(...ys)
	if (![minX, minY, maxX, maxY].every(Number.isFinite)) return EMPTY_BOX
	return [minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY)]
}

const affineCorners = (
	layer: LayerDraw,
	matrix: Affine,
	pixelsPerUnit: number,
) => {
	const sprite = layer.sprite
	const width = sprite.rect[2] / sprite.pixelsToUnit
	const height = sprite.rect[3] / sprite.pixelsToUnit
	return [-sprite.pivot[0] * width, (1 - sprite.pivot[0]) * width].flatMap(
		(x) =>
			[-sprite.pivot[1] * height, (1 - sprite.pivot[1]) * height].map((y) => ({
				x: (matrix[0] * x + matrix[2] * y + matrix[4]) * pixelsPerUnit,
				y: -(matrix[1] * x + matrix[3] * y + matrix[5]) * pixelsPerUnit,
			})),
	)
}

const boxOrUndefined = (boxes: readonly Box[]): Box | undefined =>
	boxes.length === 0 ? undefined : boxes.reduce(unionBoxes)

/** Everything a clip draws at one instant, unioned, in canvas pixels. */
export const clipBoxAt = (
	document: CharacterDocument,
	clip: Clip,
	timeMs: number,
	pixelsPerUnit: number = DEFAULT_PIXELS_PER_UNIT,
): Box | undefined =>
	boxOrUndefined(
		layersAt(document, clip, timeMs).map((layer) =>
			layerBox(layer, pixelsPerUnit),
		),
	)

/**
 * The box a clip draws across its frames: the union of every frame's drawn
 * extent, i.e. the animation's bounding box.
 *
 * Sampling at `frame / sampleRate` is what the playhead does, so frame 0 is
 * both the first and the last sample. The union is deliberately taken over
 * *all* frames, extremes included: a tile is sized to this box and a frame is
 * drawn at 1:1 inside it, so any frame the union left out would be drawn partly
 * outside its own tile. A moving clip therefore gets a box the artwork travels
 * inside rather than a box around one pose.
 */
export const clipBoundsFrames = (
	document: CharacterDocument,
	clip: Clip,
	pixelsPerUnit: number = DEFAULT_PIXELS_PER_UNIT,
): Box | undefined => {
	const sample = createFrameSampler(document, clip)
	return boxOrUndefined(
		Array.from({ length: Math.max(clipFrameTotal(clip), 1) }, (_value, frame) =>
			boxOrUndefined(
				sample((clip.sampleRate > 0 ? frame / clip.sampleRate : 0) * 1000).map(
					(layer) => layerBox(layer, pixelsPerUnit),
				),
			),
		).flatMap((box) => (box === undefined ? [] : [box])),
	)
}

/** One row of the frame inspector: a drawn layer plus the values behind it. */
export type FrameLayer = {
	readonly layer: string
	readonly sprite: string
	readonly rotation: number
	readonly position: Vec2
	readonly scale: Vec2
	readonly order: number
	readonly matrix?: Affine
	readonly opacity?: number
	readonly color?: Vec3
	/** Source rect size in atlas pixels. */
	readonly size: Vec2
}

/** The layer rows the inspector shows for one instant, in draw order. */
export const frameLayers = (
	document: CharacterDocument,
	clip: Clip,
	timeMs: number,
): readonly FrameLayer[] =>
	layersAt(document, clip, timeMs).map((layer) => ({
		layer: layer.layer,
		sprite: layer.sprite.name,
		rotation: layer.rotation,
		position: layer.position,
		scale: layer.scale,
		order: layer.order,
		...(layer.matrix === undefined ? {} : { matrix: layer.matrix }),
		...(layer.opacity === undefined ? {} : { opacity: layer.opacity }),
		...(layer.color === undefined ? {} : { color: layer.color }),
		size: [layer.sprite.rect[2], layer.sprite.rect[3]],
	}))

export type FitOptions = {
	/** The box to show, measured at `DEFAULT_PIXELS_PER_UNIT` (art pixels). */
	readonly bounds: Box
	readonly box: Vec2
	/** Pixels per art unit is clamped to this, so a tiny frame never blurs. */
	readonly maxPixelsPerUnit: number
	/** Fraction of the viewport the frame may use, e.g. 0.92. */
	readonly paddingRatio: number
}

export type Fit = {
	readonly pixelsPerUnit: number
	/** Where the logical origin (the character's feet) lands, in canvas pixels. */
	readonly origin: Vec2
}

const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max)

/**
 * Scale a frame to fill a viewport and centre it.
 *
 * A measured box is in art pixels (`DEFAULT_PIXELS_PER_UNIT`), so a scale in
 * art units is converted to pixels per unit before it is used, and the box is
 * converted the same way when it is centred. `origin` is where the logical
 * origin — the character's anchor — lands in canvas pixels, which is what the
 * painter needs: it translates by `origin` and then draws each layer at its
 * pivot-relative `quad` inside that frame. So "centre the frame" is
 * `origin = box/2 - boundsCentre`, both measured at the chosen scale.
 */
export const fitViewport = (options: FitOptions): Fit => {
	const boxWidth = options.bounds[2]
	const boxHeight = options.bounds[3]
	const usable = [
		Math.max(1, options.box[0]) * options.paddingRatio,
		Math.max(1, options.box[1]) * options.paddingRatio,
	] as const
	const scale = Math.min(
		boxWidth > 0 ? usable[0] / boxWidth : Number.POSITIVE_INFINITY,
		boxHeight > 0 ? usable[1] / boxHeight : Number.POSITIVE_INFINITY,
	)
	const pixelsPerUnit = Number.isFinite(scale)
		? clamp(scale * DEFAULT_PIXELS_PER_UNIT, 0.01, options.maxPixelsPerUnit)
		: DEFAULT_PIXELS_PER_UNIT
	const scaleFactor = pixelsPerUnit / DEFAULT_PIXELS_PER_UNIT
	const centerX = (options.bounds[0] + boxWidth / 2) * scaleFactor
	const centerY = (options.bounds[1] + boxHeight / 2) * scaleFactor
	return {
		pixelsPerUnit,
		origin: [options.box[0] / 2 - centerX, options.box[1] / 2 - centerY],
	}
}

/**
 * Snap a scale to the device grid when a nearby exact scale exists.
 *
 * Drawing at a fractional scale makes the browser resample every frame, so a
 * scale expressible exactly — a whole number of device pixels per art pixel, or
 * a single 1/n pixel below full size — is used instead. The snap is only taken
 * within `SNAP_TOLERANCE` of the requested size: a scale that would have to move
 * further keeps its requested value and the painter smooths that one blit,
 * because shrinking a frame by a third costs more than it saves. A scale already
 * on the grid comes back untouched, which is what keeps a preview tile at 1:1.
 */
const SNAP_TOLERANCE = 0.3

/**
 * The exact scale nearest below a requested one.
 *
 * Above full size the exact scales are whole device pixels per art pixel, below
 * them single 1/n pixels. The value is computed as a multiple of
 * `DEFAULT_PIXELS_PER_UNIT` in one expression so an already exact scale is never
 * nudged by floating point.
 */
const exactScaleFor = (pixelsPerUnit: number, ratio: number): number => {
	const device = (pixelsPerUnit / DEFAULT_PIXELS_PER_UNIT) * ratio
	if (device >= 1)
		return (
			(Math.max(1, Math.floor(device + 1e-6)) * DEFAULT_PIXELS_PER_UNIT) / ratio
		)
	// Below one device pixel per art pixel the exact scales are 1/n of one.
	const inverse = 1 / Math.max(device, 1e-4)
	const whole = Math.round(inverse)
	const count = Math.abs(inverse - whole) < 1e-6 ? whole : Math.ceil(inverse)
	return DEFAULT_PIXELS_PER_UNIT / (Math.max(1, count) * ratio)
}

export const quantizeFit = (pixelsPerUnit: number, ratio: number): number => {
	if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
		return DEFAULT_PIXELS_PER_UNIT
	}
	// A ratio this close to 1:1 is the natural scale with a rounding error in
	// it, not a request to draw smaller: snapping it down would shrink the
	// frame by whichever fraction the grid steps to. This is the difference
	// between a preview tile showing its frame and showing a sixth of it.
	if (
		Math.abs(pixelsPerUnit - DEFAULT_PIXELS_PER_UNIT) <=
		DEFAULT_PIXELS_PER_UNIT * 0.02
	) {
		return DEFAULT_PIXELS_PER_UNIT
	}
	const snapped = exactScaleFor(pixelsPerUnit, ratio)
	const deviation =
		Math.abs(snapped - pixelsPerUnit) / Math.max(pixelsPerUnit, 1e-6)
	return deviation <= SNAP_TOLERANCE ? snapped : pixelsPerUnit
}

/** Ceiling on the scale, so a tiny frame is never blown up into mush. */
export const MAX_CLIP_PIXELS_PER_UNIT = 4 * DEFAULT_PIXELS_PER_UNIT

/**
 * The scale a frame should be drawn at to sit nicely inside a box: at most 1:1
 * (one art pixel per device pixel) and less when the frame is larger than the
 * box. This is what keeps a thumbnail sharp instead of a resample.
 */
export const clipViewPixelsPerUnit = (
	bounds: Box,
	box: Vec2,
	ratio: number,
): number => {
	if (bounds[2] <= 0 || bounds[3] <= 0) return DEFAULT_PIXELS_PER_UNIT
	const fitted = Math.min(box[0] / bounds[2], box[1] / bounds[3])
	return quantizeFit(
		Math.min(DEFAULT_PIXELS_PER_UNIT, fitted * DEFAULT_PIXELS_PER_UNIT),
		ratio,
	)
}

export type ClipFitOptions = {
	/** Whole-clip display reduction, applied after fitting in the reduced coordinate space. */
	readonly displayScale?: number
	/** The frame's box, measured at 1:1 by `clipBoundsFrames` (art pixels). */
	readonly bounds: Box
	readonly box: Vec2
	/** Ceiling on the effective scale, so a tiny frame is not blown up. */
	readonly maxPixelsPerUnit: number
	/** Fraction of the box the frame may use in `fit` mode. */
	readonly paddingRatio: number
	readonly ratio: number
	/** `fit` fills the box; `exact` renders at `zoom` art pixels per pixel. */
	readonly mode: "fit" | "exact"
	/** The 1:1 multiple for `exact` mode, ignored by `fit`. */
	readonly zoom: number
}

export type ClipFit = {
	readonly pixelsPerUnit: number
	readonly origin: Vec2
	/** Effective device pixels per art pixel — what a scale readout shows. */
	readonly effectiveScale: number
}

/**
 * Everything a painter needs to place one frame: the scale, the origin and a
 * scale readout.
 *
 * `fit` uses whatever size fills the box (capped by `maxPixelsPerUnit`);
 * `exact` uses the requested multiple of 1:1 and ignores the box, because the
 * canvas it draws into is the frame's own box in that mode — a preview tile is
 * sized to its artwork, so "exact" there is exactly one art pixel per pixel.
 * Both snap to the device grid and centre the frame at the chosen scale.
 *
 * The two spaces a fitted scale lives in are the whole subtlety here: a box
 * measured by `clipBoundsFrames` counts art pixels, while `box` is a canvas in
 * CSS pixels, so the ratio between them is scaled by `DEFAULT_PIXELS_PER_UNIT`
 * — leaving it out draws a 122-pixel frame at a third of a pixel.
 */
export const fitClipView = (options: ClipFitOptions): ClipFit => {
	const displayScale = options.displayScale ?? 1
	const requested = options.zoom * DEFAULT_PIXELS_PER_UNIT
	const boundsWidth = options.bounds[2] * displayScale
	const boundsHeight = options.bounds[3] * displayScale
	// Fit on the tighter axis; a degenerate (flat) box constrains nothing.
	const room =
		Math.min(
			boundsWidth > 0
				? (Math.max(1, options.box[0]) * options.paddingRatio) / boundsWidth
				: Number.POSITIVE_INFINITY,
			boundsHeight > 0
				? (Math.max(1, options.box[1]) * options.paddingRatio) / boundsHeight
				: Number.POSITIVE_INFINITY,
		) * DEFAULT_PIXELS_PER_UNIT
	const fitted = Math.min(
		Math.max(1e-4, Number.isFinite(room) ? room : requested),
		options.maxPixelsPerUnit,
	)
	const pixelsPerUnit = quantizeFit(
		options.mode === "fit" ? fitted : requested,
		options.ratio,
	)
	// Centre the frame: `origin = boxCentre - boundsCentre`, both measured at
	// the chosen scale. Scaling the bounds is what keeps a zoomed frame centred
	// on the same point instead of drifting off the canvas.
	const scaleFactor = pixelsPerUnit / DEFAULT_PIXELS_PER_UNIT
	const boundsCentreX =
		(options.bounds[0] * displayScale + boundsWidth / 2) * scaleFactor
	const boundsCentreY =
		(options.bounds[1] * displayScale + boundsHeight / 2) * scaleFactor
	return {
		pixelsPerUnit: pixelsPerUnit * displayScale,
		origin: [
			options.box[0] / 2 - boundsCentreX,
			options.box[1] / 2 - boundsCentreY,
		],
		effectiveScale: scaleFactor * displayScale,
	}
}

/**
 * How many frames of a clip the timeline strip samples. Sampling rather than
 * one tile per frame keeps a 75-frame action from painting 75 canvases.
 */
export const frameStripIndices = (
	frameTotal: number,
	limit: number,
): readonly number[] => {
	const total = Math.max(1, Math.floor(frameTotal))
	const count = Math.max(1, Math.min(Math.floor(limit), total))
	return Array.from({ length: count }, (_value, index) =>
		Math.min(
			total - 1,
			Math.round((index * (total - 1)) / Math.max(1, count - 1)),
		),
	)
}

/** The frame cells the timeline strip renders for a clip. */
export const clipStripFrames = (
	clip: Clip,
	limit: number,
): readonly { readonly index: number; readonly timeMs: number }[] =>
	frameStripIndices(clipFrameTotal(clip), limit).map((index) => ({
		index,
		timeMs: clip.sampleRate > 0 ? (index / clip.sampleRate) * 1000 : 0,
	}))

/** Atlas page size in art pixels, for the sprite metadata line. */
export const clipAtlasSize = (
	document: CharacterDocument,
	clip: Clip,
): Vec2 | undefined =>
	clipSpriteNames(clip)
		.flatMap((name) => {
			const sprite = spriteByName(document, name)
			return sprite === undefined ? [] : [atlasSize(sprite, document)]
		})
		.at(0)

/** Where a playhead sits along a clip, 0..1. */
export const clipProgress = (timeMs: number, clip: Clip): number => {
	const duration = clipDuration(clip)
	if (duration <= 0) return 0
	return clamp(timeMs / duration, 0, 1)
}
