import { type ReactNode, useEffect } from "react"

import { clipFrameTotal, DEFAULT_PIXELS_PER_UNIT } from "../../kernel"
import type { Box } from "../../kernel/preview"
import type { CharacterDocument, Clip } from "../../kernel/types"
import { paintClipFrame, useCanvasBox, useDeviceRatio } from "../paint"

/** Floor for a frame's natural size, so a near-empty clip still has a target. */
const MIN_SIDE = 16

export type PreviewCellProps = {
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly timeMs: number
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	/** The clip's box across all frames, measured by the grid at 1:1. */
	readonly bounds: Box | undefined
	readonly displayScale: number
	readonly label?: string
	readonly controls?: ReactNode
	/** Bounds already scaled into display pixels, shared across every variant. */
	readonly layoutBounds?: Box
}

/**
 * A measured box is in canvas pixels at the kernel's default scale, so its size
 * is already the frame's size in art pixels — rounded, because a tile is whole
 * pixels and a fractional canvas would make the browser resample every frame.
 * A clip that draws nothing gets the floor: an empty tile stays small instead
 * of taking the whole row.
 */
const artSide = (value: number | undefined): number =>
	value === undefined ? MIN_SIDE : Math.max(MIN_SIDE, Math.round(value))

/**
 * One tile of the animation preview: the clip's current frame at its natural
 * size, with the clip's own name and length.
 *
 * The canvas follows the clip's whole-animation box at the selected display
 * scale. The same fixed multiplier sizes the tile, the origin and every layer.
 * Every frame is inside the tile by construction: the box unions all of them, so a
 * moving action gets a tile the artwork travels inside rather than a tile that
 * crops it. A small character gets a small tile and a large one a large tile,
 * which is what lets the flex layout wrap. The caller owns the clock, so every
 * tile shows the same instant.
 */
export function PreviewCell(props: PreviewCellProps) {
	const { ref, box } = useCanvasBox()
	const ratio = useDeviceRatio()
	const { document, clip, timeMs, atlasImages, bounds, displayScale } = props
	const layout: Box | undefined =
		props.layoutBounds ??
		(bounds === undefined
			? undefined
			: [
					bounds[0] * displayScale,
					bounds[1] * displayScale,
					bounds[2] * displayScale,
					bounds[3] * displayScale,
				])
	const width = artSide(layout?.[2])
	const height = artSide(layout?.[3])

	useEffect(() => {
		const canvas = ref.current
		if (canvas === null || layout === undefined) return
		// Centre the clip's box on the tile. The bounds are the union of what
		// every frame draws, so mapping them onto the tile corners places the
		// current frame without guessing — the painter draws at
		// `origin + pivot + quad`, which is exactly `origin + bounds`:
		// `canvas = origin + bounds` by construction.
		const origin: [number, number] = [
			(width - layout[2]) / 2 - layout[0],
			(height - layout[3]) / 2 - layout[1],
		]
		paintClipFrame(canvas, {
			document,
			clip,
			timeMs,
			atlasImages,
			ratio,
			pixelsPerUnit: DEFAULT_PIXELS_PER_UNIT * displayScale,
			origin,
		})
	}, [
		document,
		clip,
		timeMs,
		atlasImages,
		layout,
		ratio,
		box,
		ref,
		width,
		height,
		displayScale,
	])

	return (
		<figure className="flex flex-col items-center gap-1">
			<canvas
				ref={ref}
				style={{ width: `${width}px`, height: `${height}px` }}
				data-testid={`preview-frame-${props.label ?? clip.name}`}
			/>
			<figcaption className="flex items-baseline gap-2 text-xs">
				<span className="truncate" title={props.label ?? clip.name}>
					{props.label ?? clip.name}
				</span>
				<span className="shrink-0 text-muted-foreground tabular-nums">
					{clipFrameTotal(clip)}
				</span>
			</figcaption>
			{props.controls}
		</figure>
	)
}
