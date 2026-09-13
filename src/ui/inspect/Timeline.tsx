import { memo, useEffect, useMemo } from "react"

import {
	clipFrameTotal,
	clipStripFrames,
	DEFAULT_PIXELS_PER_UNIT,
	frameIndex,
} from "../../kernel"
import type { Box } from "../../kernel/preview"
import type { CharacterDocument, Clip } from "../../kernel/types"
import {
	paintClipFitted,
	TILE_PADDING_RATIO,
	useCanvasBox,
	useDeviceRatio,
} from "../paint"

/**
 * How many frame cells the strip samples. Sampling rather than one cell per
 * frame is what keeps a 75-frame action from painting 75 canvases at once.
 */
const STRIP_LIMIT = 32

export type TimelineProps = {
	readonly displayScale: number
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly timeMs: number
	readonly bounds: Box | undefined
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly onTime: (timeMs: number) => void
}

/**
 * The timeline, as a strip of real frame thumbnails.
 *
 * The strip is the scrub surface: clicking a cell moves the playhead there. It
 * carries no readout of its own — the frame panel beside the stage already
 * reports the current frame, its milliseconds and the drawn layer count.
 */
export function Timeline(props: TimelineProps) {
	const { clip, timeMs, onTime } = props
	const frames = useMemo(() => clipStripFrames(clip, STRIP_LIMIT), [clip])
	const frame = frameIndex(timeMs, clip.sampleRate, clipFrameTotal(clip))

	return (
		<div className="shrink-0 border-border border-t px-3 py-2">
			<FrameStrip
				displayScale={props.displayScale}
				document={props.document}
				clip={clip}
				atlasImages={props.atlasImages}
				bounds={props.bounds}
				frames={frames}
				frame={frame}
				onTime={onTime}
			/>
		</div>
	)
}

type FrameStripProps = {
	readonly displayScale: number
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly bounds: Box | undefined
	readonly frames: readonly {
		readonly index: number
		readonly timeMs: number
	}[]
	readonly frame: number
	readonly onTime: (timeMs: number) => void
}

const FrameStrip = memo(function FrameStrip(props: FrameStripProps) {
	return (
		<div className="flex items-stretch gap-1 overflow-x-auto">
			{props.frames.map((entry) => (
				<button
					key={entry.index}
					type="button"
					aria-pressed={entry.index === props.frame}
					aria-label={`frame ${entry.index}`}
					className={
						entry.index === props.frame
							? "rounded-sm border border-primary bg-secondary p-0.5"
							: "rounded-sm border border-transparent p-0.5 hover:bg-muted"
					}
					onClick={() => props.onTime(entry.timeMs)}
				>
					<FrameTile
						displayScale={props.displayScale}
						document={props.document}
						clip={props.clip}
						atlasImages={props.atlasImages}
						bounds={props.bounds}
						timeMs={entry.timeMs}
					/>
				</button>
			))}
		</div>
	)
})

type FrameTileProps = {
	readonly displayScale: number
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly bounds: Box | undefined
	readonly timeMs: number
}

/**
 * One cell of the frame strip.
 *
 * The whole frame is fitted into the cell — never enlarged past 1:1, shrunk
 * when the pose is bigger — so a thumbnail always shows the frame instead of
 * wherever its anchor happens to fall. Framing on the anchor put every aerial
 * pose hundreds of pixels above a 48-pixel cell.
 */
const FrameTile = memo(function FrameTile(props: FrameTileProps) {
	const { ref, box } = useCanvasBox()
	const ratio = useDeviceRatio()
	const { document, clip, timeMs, atlasImages, bounds, displayScale } = props

	useEffect(() => {
		const canvas = ref.current
		if (canvas === null || box.width === 0 || box.height === 0) return
		if (bounds === undefined || bounds[2] <= 0 || bounds[3] <= 0) return
		paintClipFitted(canvas, {
			displayScale,
			document,
			clip,
			timeMs,
			atlasImages,
			ratio,
			bounds,
			dest: [box.width, box.height],
			maxPixelsPerUnit: DEFAULT_PIXELS_PER_UNIT,
			paddingRatio: TILE_PADDING_RATIO,
		})
	}, [
		document,
		clip,
		timeMs,
		atlasImages,
		bounds,
		ratio,
		box,
		ref,
		displayScale,
	])

	return <canvas ref={ref} className="block h-12 w-10" />
})
