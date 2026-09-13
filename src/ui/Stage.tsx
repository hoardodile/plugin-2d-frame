import { useEffect } from "react"

import { DEFAULT_PIXELS_PER_UNIT } from "../kernel"
import type { Box } from "../kernel/preview"
import type { CharacterDocument, Clip, Vec2 } from "../kernel/types"
import {
	paintClipFitted,
	STAGE_PADDING_RATIO,
	useCanvasBox,
	useDeviceRatio,
} from "./paint"

export type StageProps = {
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly timeMs: number
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	/** The clip's box across all frames, measured at 1:1. */
	readonly bounds: Box | undefined
	readonly displayScale: number
}

/**
 * Canvas painter for the inspector: one sampled frame, framed in the viewport.
 *
 * The frame uses the selected display size whenever its whole-animation box
 * fits the stage. It is scaled further down when the reduced box is
 * bigger than the stage, so a dash or a jump stays visible instead of landing
 * outside the canvas. Frames are never scaled up, and the scale snaps to whole
 * device pixels in the reduced coordinate space.
 */
export function Stage(props: StageProps) {
	const { ref, box } = useCanvasBox()
	const ratio = useDeviceRatio()

	useEffect(() => {
		const canvas = ref.current
		if (canvas === null) return
		const { document, clip, timeMs, atlasImages, bounds } = props
		if (bounds === undefined) return
		const dest: Vec2 = [box.width, box.height]
		paintClipFitted(canvas, {
			displayScale: props.displayScale,
			document,
			clip,
			timeMs,
			atlasImages,
			ratio,
			bounds,
			dest,
			maxPixelsPerUnit: DEFAULT_PIXELS_PER_UNIT,
			paddingRatio: STAGE_PADDING_RATIO,
		})
	}, [props, ratio, box, ref])

	return (
		<canvas ref={ref} className="block size-full" data-testid="frame-stage" />
	)
}
