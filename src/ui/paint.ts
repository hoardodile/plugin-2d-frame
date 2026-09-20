/**
 * Canvas painting shared by the preview grid, the timeline strip and the
 * inspector stage.
 *
 * Every painter follows the same rules the repo holds itself to: the context is
 * scaled once by the device ratio, quads snap to whole device pixels, and
 * smoothing only turns on where the frame is genuinely downsampled.
 */

import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"

import {
	atlasImageFor,
	atlasSource,
	canvasRotation,
	createFrameSampler,
	fitClipView,
	integerSourceRect,
	quadFor,
} from "../kernel"
import type { Box } from "../kernel/preview"
import type { CharacterDocument, Clip, Vec2 } from "../kernel/types"
import { tintedSprite } from "./tint"

export type BoxState = { readonly width: number; readonly height: number }

/**
 * Track a canvas's CSS content box.
 *
 * The canvas draws with the size the layout gives it, so a change of that size
 * has to schedule a repaint; the observer watches the CSS box, never the
 * backing store the painter resizes. The returned ref is stable, so React never
 * tears the observer down between renders.
 */
export const useCanvasBox = (): {
	readonly ref: RefObject<HTMLCanvasElement | null>
	readonly box: BoxState
} => {
	const [box, setBox] = useState<BoxState>({ width: 0, height: 0 })
	const ref = useRef<HTMLCanvasElement | null>(null)
	useEffect(() => {
		const element = ref.current
		if (element === null) return undefined
		const measure = () =>
			setBox((current) =>
				current.width === element.clientWidth &&
				current.height === element.clientHeight
					? current
					: { width: element.clientWidth, height: element.clientHeight },
			)
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(element)
		return () => observer.disconnect()
	}, [])
	return { ref, box }
}

/** Device ratio to draw at: whole device pixels per art pixel, or a fraction. */
export const useDeviceRatio = (): number => {
	const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1)
	useEffect(() => {
		const update = () => setRatio(window.devicePixelRatio || 1)
		window.addEventListener("resize", update)
		return () => window.removeEventListener("resize", update)
	}, [])
	return ratio
}

export const prepareCanvas = (
	canvas: HTMLCanvasElement,
	ratio: number,
	size?: Vec2,
): CanvasRenderingContext2D | null => {
	const context = canvas.getContext("2d")
	if (context === null) return null
	const width = size?.[0] ?? canvas.clientWidth
	const height = size?.[1] ?? canvas.clientHeight
	const targetWidth = Math.max(1, Math.round(width * ratio))
	const targetHeight = Math.max(1, Math.round(height * ratio))
	if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
		canvas.width = targetWidth
		canvas.height = targetHeight
	}
	context.setTransform(ratio, 0, 0, ratio, 0, 0)
	context.clearRect(0, 0, width, height)
	return context
}

export type ClipFrameProps = {
	/** Explicit canvas size for detached frame captures. */
	readonly size?: Vec2
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly timeMs: number
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly ratio: number
	/** Pixels per art unit to draw at. */
	readonly pixelsPerUnit: number
	/** Where the logical origin lands, in canvas pixels. */
	readonly origin: Vec2
}

const frameSamplers = new WeakMap<
	CharacterDocument,
	WeakMap<Clip, ReturnType<typeof createFrameSampler>>
>()
const samplerFor = (document: CharacterDocument, clip: Clip) => {
	const clips =
		frameSamplers.get(document) ??
		new WeakMap<Clip, ReturnType<typeof createFrameSampler>>()
	frameSamplers.set(document, clips)
	const sampler = clips.get(clip) ?? createFrameSampler(document, clip)
	clips.set(clip, sampler)
	return sampler
}

/**
 * Blit one sampled frame into a canvas, in draw order.
 *
 * The caller supplies the scale and origin, because "fill the viewport" and
 * "fit inside a tile" only differ in those two numbers — the drawing rules are
 * identical.
 *
 * `origin` is where the logical origin lands, and `quad` is pivot-relative, so
 * the transform is *translate to the pivot, then draw the quad about the local
 * origin*: the drawn rect is `origin + pivot + quad` and nothing else. Adding
 * the origin a second time — to the quad as well as to the translate — lands a
 * frame at twice its intended distance from the canvas corner, which is how
 * every tile ends up showing a corner of its own pose instead of the pose.
 */
export const paintClipFrame = (
	canvas: HTMLCanvasElement,
	props: ClipFrameProps,
): void => {
	const context = prepareCanvas(canvas, props.ratio, props.size)
	if (context === null) return
	const snap = (value: number): number =>
		Math.round(value * props.ratio) / props.ratio
	for (const layer of samplerFor(props.document, props.clip)(props.timeMs)) {
		const image = atlasImageFor(layer.sprite, props.atlasImages)
		if (image === undefined) continue
		const source = integerSourceRect(atlasSource(layer.sprite, props.document))
		if (layer.matrix) {
			const [a, b, c, d, tx, ty] = layer.matrix
			const unit = props.pixelsPerUnit / layer.sprite.pixelsToUnit
			const tinted = layer.color?.some((value) => value !== 1)
				? tintedSprite(image, source, layer.color)
				: undefined
			context.save()
			context.globalAlpha = layer.opacity ?? 1
			const x = props.origin[0] + tx * props.pixelsPerUnit
			const y = props.origin[1] - ty * props.pixelsPerUnit
			const left = -layer.sprite.pivot[0] * source[2] * unit
			const top = -(1 - layer.sprite.pivot[1]) * source[3] * unit
			let drawLeft = left
			let drawTop = top
			let drawWidth = source[2] * unit
			let drawHeight = source[3] * unit
			if (b === 0 && c === 0) {
				// Snap the transformed edges, including the pivot offset. Snapping
				// just the pivot leaves adjacent quads on fractional pixels, where
				// canvas edge coverage exposes hairlines even with smoothing off.
				// Serialized float noise must not split a shared half-pixel edge.
				const edge = (value: number) =>
					Math.round(Math.round(value * props.ratio * 1e4) / 1e4) / props.ratio
				const startX = edge(x + a * left)
				const startY = edge(y + d * top)
				const endX = edge(x + a * (left + drawWidth))
				const endY = edge(y + d * (top + drawHeight))
				context.translate(startX, startY)
				context.scale(Math.sign(a), Math.sign(d))
				drawLeft = 0
				drawTop = 0
				drawWidth = Math.abs(endX - startX)
				drawHeight = Math.abs(endY - startY)
			} else {
				// Preserve relative positions through rotation and shear; rounding
				// each layer's pivot independently can pull joined pieces apart.
				context.translate(x, y)
				context.transform(a, -b, -c, d, 0, 0)
			}
			const deviceScale =
				Math.min(Math.hypot(a, b), Math.hypot(c, d)) * unit * props.ratio
			context.imageSmoothingEnabled =
				deviceScale < 1 - 1e-3 &&
				Math.abs(1 / deviceScale - Math.round(1 / deviceScale)) > 1e-3
			context.imageSmoothingQuality = "high"
			context.drawImage(
				tinted ?? image,
				tinted ? 0 : source[0],
				tinted ? 0 : source[1],
				source[2],
				source[3],
				drawLeft,
				drawTop,
				drawWidth,
				drawHeight,
			)
			context.restore()
			continue
		}
		const quad = quadFor(
			layer.sprite,
			layer.position,
			layer.scale,
			props.pixelsPerUnit,
		)
		const left = snap(quad.left)
		const top = snap(quad.top)
		const right = snap(quad.left + quad.width)
		const bottom = snap(quad.top + quad.height)
		// Nearest-neighbour at 1:1, when enlarging, and whenever the scale is a
		// single 1/n of a device pixel — those are the exact scales, where
		// interpolating would blur a pixel that could have been dropped whole. A
		// layer the animation genuinely scales to a non-unit fraction is
		// smoothed, where dropping pixels would alias instead.
		const deviceScale = ((right - left) * props.ratio) / source[2]
		const reciprocal = 1 / deviceScale
		const exactScale =
			Math.abs(reciprocal - Math.round(reciprocal)) < 1e-3 ||
			Math.abs(deviceScale - Math.round(deviceScale)) < 1e-3
		context.imageSmoothingEnabled = deviceScale < 1 - 1e-3 && !exactScale
		context.imageSmoothingQuality = "high"
		context.save()
		context.globalAlpha = layer.opacity ?? 1
		context.translate(
			snap(props.origin[0] + quad.pivotX),
			snap(props.origin[1] + quad.pivotY),
		)
		context.rotate(canvasRotation(layer.rotation))
		const tinted = layer.color?.some((value) => value !== 1)
			? tintedSprite(image, source, layer.color)
			: undefined
		context.drawImage(
			tinted ?? image,
			tinted ? 0 : source[0],
			tinted ? 0 : source[1],
			source[2],
			source[3],
			left,
			top,
			Math.max(1 / props.ratio, right - left),
			Math.max(1 / props.ratio, bottom - top),
		)
		context.restore()
	}
}

export type FitPaintProps = Omit<ClipFrameProps, "origin" | "pixelsPerUnit"> & {
	readonly displayScale?: number
	/** The frame's box, measured with `clipBoundsFrames` at 1:1. */
	readonly bounds: Box
	/** The canvas content box the frame has to fit into. */
	readonly dest: Vec2
	/** Ceiling on the scale, so a tiny frame is never blown up into mush. */
	readonly maxPixelsPerUnit: number
	/** Fraction of the destination the frame may use. */
	readonly paddingRatio: number
}

/** Ceilings so the inspector stage and a strip thumbnail both stay legible. */
export const STAGE_PADDING_RATIO = 0.94
/** 1 keeps a full-frame pose touching the tile edge, never crossing it. */
export const TILE_PADDING_RATIO = 0.98

/**
 * Paint a frame framed inside its box: scale to fill and centre the bounds, so
 * nothing is ever drawn outside the canvas. The scale is snapped to whole
 * device pixels per art pixel, which is what keeps a thumbnail from blurring.
 */
export const paintClipFitted = (
	canvas: HTMLCanvasElement,
	props: FitPaintProps,
): void => {
	const view = fitClipView({
		displayScale: props.displayScale,
		bounds: props.bounds,
		box: props.dest,
		maxPixelsPerUnit: props.maxPixelsPerUnit,
		paddingRatio: props.paddingRatio,
		ratio: props.ratio,
		mode: "fit",
		zoom: 1,
	})
	paintClipFrame(canvas, {
		...props,
		pixelsPerUnit: view.pixelsPerUnit,
		origin: view.origin,
	})
}
