import { Button } from "@hoardodile/ui/components/button"
import { Icon } from "@hoardodile/ui/components/icon"
import { Pause, Play, Restart } from "@hoardodile/ui/icons/registry"
import type { ReactNode } from "react"

import { useTranslation } from "../i18n"
import { READOUT_SLOT } from "./inspect/readout"
import type { ViewMode } from "./ModeToggle"
import { ModeToggle } from "./ModeToggle"

export type PlaybackBarProps = {
	readonly reducedSize: boolean
	readonly onReducedSize: (value: boolean) => void
	readonly playing: boolean
	readonly onToggle: () => void
	readonly onRestart: () => void
	/** What the first badge slot reports; both views keep it the same width. */
	readonly readout: string
	readonly mode: ViewMode
	readonly onMode: (mode: ViewMode) => void
	/** Collection resources put their character picker next to the switch. */
	readonly picker?: ReactNode
}

/**
 * The bottom row both views share.
 *
 * The viewer has exactly one surface at a time, so the transport, the readout
 * and the view switch always occupy the same row in the same order: play/pause,
 * restart, the live readout, then — pushed right — the character picker (only
 * for a collection) and the view switch.
 */
export function PlaybackBar(props: PlaybackBarProps) {
	const { t } = useTranslation()

	return (
		<footer className="flex flex-wrap items-center gap-2 border-border border-t px-3 py-2">
			<Button
				size="icon-sm"
				variant="ghost"
				aria-label={props.playing ? t("controls.pause") : t("controls.play")}
				onClick={props.onToggle}
			>
				<Icon icon={props.playing ? Pause : Play} size="sm" />
			</Button>
			<Button
				size="icon-sm"
				variant="ghost"
				aria-label={t("controls.restart")}
				onClick={props.onRestart}
			>
				<Icon icon={Restart} size="sm" />
			</Button>
			{/*
			 * The readout carries live numbers, so it keeps a fixed-width slot
			 * (a growing value must not shift the switch) — but inside that slot
			 * it is plain text: no border of its own, left-aligned, and centred
			 * vertically by the row.
			 */}
			<div
				className={`${READOUT_SLOT} flex shrink-0 items-center`}
				data-testid="frame-readout"
			>
				<span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
					{props.readout}
				</span>
			</div>
			<div className="ml-auto flex items-center gap-2">
				<Button
					size="sm"
					variant={props.reducedSize ? "secondary" : "ghost"}
					aria-pressed={props.reducedSize}
					title={t("controls.reducedSizeHint")}
					onClick={() => props.onReducedSize(!props.reducedSize)}
				>
					{t("controls.reducedSize")}
				</Button>
				{props.picker}
				<ModeToggle value={props.mode} onChange={props.onMode} />
			</div>
		</footer>
	)
}
