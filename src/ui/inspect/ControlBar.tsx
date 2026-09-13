import type { ReactNode } from "react"

import { useTranslation } from "../../i18n"
import { clipFrameTotal, frameIndex } from "../../kernel"
import type { Clip } from "../../kernel/types"
import type { ViewMode } from "../ModeToggle"
import { PlaybackBar } from "../PlaybackBar"

export type ControlBarProps = {
	readonly reducedSize: boolean
	readonly onReducedSize: (value: boolean) => void
	readonly clip: Clip
	readonly timeMs: number
	readonly playing: boolean
	readonly onToggle: () => void
	readonly onRestart: () => void
	readonly mode: ViewMode
	readonly onMode: (mode: ViewMode) => void
	readonly picker?: ReactNode
}

/**
 * The inspector's bottom row: transport plus the playhead readout.
 *
 * Frames are shown at 1:1 and the frame strip already scrubs, so there is no
 * zoom, no speed and no step control here.
 */
export function ControlBar(props: ControlBarProps) {
	const { t } = useTranslation()
	const total = clipFrameTotal(props.clip)

	return (
		<PlaybackBar
			reducedSize={props.reducedSize}
			onReducedSize={props.onReducedSize}
			playing={props.playing}
			onToggle={props.onToggle}
			onRestart={props.onRestart}
			readout={t("inspect.head", {
				frame: frameIndex(props.timeMs, props.clip.sampleRate, total),
				total: Math.max(total - 1, 0),
				ms: Math.round(props.timeMs),
			})}
			mode={props.mode}
			onMode={props.onMode}
			picker={props.picker}
		/>
	)
}
