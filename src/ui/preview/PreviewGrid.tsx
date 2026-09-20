import type { ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"

import { useTranslation } from "../../i18n"
import { actionHasDifferences, modelActions } from "../../kernel"
import type { CharacterDocument } from "../../kernel/types"
import type { ViewMode } from "../ModeToggle"
import { PlaybackBar } from "../PlaybackBar"
import { ActionPreview } from "./ActionPreview"

export type PreviewGridProps = {
	readonly reducedSize: boolean
	readonly onReducedSize: (value: boolean) => void
	readonly document: CharacterDocument
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly mode: ViewMode
	readonly onMode: (mode: ViewMode) => void
	readonly picker?: ReactNode
}

/**
 * The default view: every action of the character playing at once.
 *
 * One clock drives every tile — each cell samples `elapsed % clipDuration` — so
 * the panel runs on a single animation frame. Tiles are laid out with a wrapping
 * flex row and sized to their own artwork, so frames are shown at 1:1 and the
 * layout adapts to the character instead of forcing every action into one cell
 * size. The clock, the transport and the view switch sit in the same bottom bar
 * the inspector uses. No audio path exists here at all.
 */
export function PreviewGrid({
	reducedSize,
	onReducedSize,
	document,
	atlasImages,
	mode,
	onMode,
	picker,
}: PreviewGridProps) {
	const { t } = useTranslation()
	const [elapsed, setElapsed] = useState(0)
	const [playing, setPlaying] = useState(true)
	const [differencesOnly, setDifferencesOnly] = useState(false)
	const [resetSignal, setResetSignal] = useState(0)
	const containerRef = useRef<HTMLDivElement | null>(null)

	// One clock for the whole grid. Elapsed time lives in a ref while playing and
	// is published through state, so the loop never restarts on a state update
	// and every tile reads the same instant.
	const elapsedRef = useRef(0)
	useEffect(() => {
		if (!playing) return undefined
		let handle = 0
		let last = performance.now()
		const tick = (now: number) => {
			elapsedRef.current += Math.max(0, now - last)
			last = now
			setElapsed(elapsedRef.current)
			handle = requestAnimationFrame(tick)
		}
		handle = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(handle)
	}, [playing])

	const restartClock = () => {
		elapsedRef.current = 0
		setElapsed(0)
		setResetSignal((current) => current + 1)
	}

	const actions = useMemo(() => modelActions(document), [document])
	const shown = differencesOnly ? actions.filter(actionHasDifferences) : actions

	return (
		<div className="flex size-full min-h-0 flex-col">
			{document.actions !== undefined ? (
				<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={differencesOnly}
							onChange={(event) => setDifferencesOnly(event.target.checked)}
						/>
						{t("variants.differencesOnly")}
					</label>
					<span className="ml-auto text-muted-foreground">
						{t("variants.sources", {
							count: document.modelSources?.length ?? 1,
						})}
					</span>
				</div>
			) : null}
			<div
				ref={containerRef}
				data-testid="preview-grid"
				className="flex min-h-0 flex-1 flex-wrap content-start items-start gap-4 overflow-y-auto p-3"
			>
				{shown.map((action) => (
					<ActionPreview
						key={action.id}
						document={document}
						action={action}
						elapsed={elapsed}
						resetSignal={resetSignal}
						reducedSize={reducedSize}
						atlasImages={atlasImages}
					/>
				))}
				{shown.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("variants.noDifferences")}
					</p>
				) : null}
			</div>
			<PlaybackBar
				reducedSize={reducedSize}
				onReducedSize={onReducedSize}
				playing={playing}
				onToggle={() => setPlaying((current) => !current)}
				onRestart={restartClock}
				// `count` selects i18next's plural form for this key.
				readout={t("preview.clips", { count: shown.length })}
				mode={mode}
				onMode={onMode}
				picker={picker}
			/>
		</div>
	)
}
