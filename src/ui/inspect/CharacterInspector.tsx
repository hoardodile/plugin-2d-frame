import { useBelowPanel, useBelowSidebar } from "@hoardodile/ui/hooks/use-mobile"
import { Effect } from "effect"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { playUrl, stopAll } from "../../boundary/audio"
import type { AudioMap } from "../../boundary/documents"
import type { ViewerRuntime } from "../../boundary/layer"
import { fileUrl } from "../../boundary/resource"
import { useTranslation } from "../../i18n"
import {
	clipBoundsFrames,
	clipDisplayScale,
	clipDuration,
	modelActions,
} from "../../kernel"
import type { DueEvent } from "../../kernel/events"
import type { Box } from "../../kernel/preview"
import type { CharacterDocument, Clip } from "../../kernel/types"
import { CoverButton } from "../CoverButton"
import { captureFrame } from "../cover"
import type { ViewMode } from "../ModeToggle"
import { Stage } from "../Stage"
import { usePlayback } from "../usePlayback"
import { useViewerPrefs } from "../useViewerPrefs"
import { ActionList } from "./ActionList"
import { ControlBar } from "./ControlBar"
import { FrameInspector } from "./FrameInspector"
import { Timeline } from "./Timeline"

export type CharacterInspectorProps = {
	readonly reducedSize: boolean
	readonly onReducedSize: (value: boolean) => void
	readonly document: CharacterDocument
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly audioMap: AudioMap
	readonly directory: string
	readonly runtime: ViewerRuntime
	readonly mode: ViewMode
	readonly onMode: (mode: ViewMode) => void
	readonly picker?: ReactNode
}

/** Stand-in for a document with no clips at all; the view renders an error. */
const NO_CLIP: Clip = {
	name: "",
	sampleRate: 30,
	frameCount: 0,
	durationMs: 0,
	tracks: [],
	constants: {},
}

/**
 * The inspector: what is drawn, frame by frame, at native size.
 *
 * Frames are shown at 1:1 — one art pixel, one device pixel — and the viewer
 * offers no zoom control at all; a clip whose whole-animation box is larger
 * than the stage is framed into it rather than cropped, so the pose is always
 * on screen. The stage owns the top of the panel and the transport sits at the
 * bottom, so the artwork is never squeezed by chrome. Panels carry the sampled
 * values (layer transforms, frame thumbnails, per-action lengths) rather than
 * leaving the space empty.
 */
export function CharacterInspector({
	reducedSize,
	onReducedSize,
	document,
	atlasImages,
	audioMap,
	directory,
	runtime,
	mode,
	onMode,
	picker,
}: CharacterInspectorProps) {
	const { t } = useTranslation()
	const [selection, setSelection] = useState({ actionId: "", variantIndex: 0 })
	const [cycleVariants, setCycleVariants] = useState(true)
	const [soundIndex, setSoundIndex] = useState(0)
	// The three viewer switches are plugin preferences, so they survive a
	// reload and apply to every character in a collection.
	const { loop, setLoop, autoNext, setAutoNext, sound, setSound } =
		useViewerPrefs()
	// The side panels follow the viewport, at the library's own layout
	// breakpoints: the action list is a side rail like the app shell's sidebar,
	// and the frame panel is a right rail like the filter rail. Narrow windows
	// simply hand their width to the stage instead of stacking chrome.
	const belowSidebar = useBelowSidebar()
	const belowPanel = useBelowPanel()
	const showActions = !belowSidebar
	const showPanel = !belowSidebar && !belowPanel

	const actions = useMemo(() => modelActions(document), [document])
	const action =
		actions.find((a) => a.id === selection.actionId) ??
		actions.find((a) => a.name === "C_idle") ??
		actions[0]
	const variantIndex = action?.variants[selection.variantIndex]
		? selection.variantIndex
		: 0
	const variant = action?.variants[variantIndex]
	const clip: Clip | undefined = document.clips.find(
		(item) => item.name === variant?.clip,
	)
	const soundName =
		variant?.sounds[soundIndex]?.name ?? variant?.sounds[0]?.name ?? clip?.name
	const selectAction = (actionId: string) => {
		setSelection({ actionId, variantIndex: 0 })
		setSoundIndex(0)
	}

	useEffect(() => {
		setSelection({ actionId: "", variantIndex: 0 })
		setSoundIndex(0)
	}, [document])

	// Leaving the technical view must not leave a frame's sample playing.
	useEffect(() => () => void runtime.runPromise(stopAll()), [runtime])

	const playFile = useCallback(
		(file: string, volume: number) => {
			const resolved = file.startsWith("/") ? file : `${directory}${file}`
			void runtime.runPromise(
				Effect.gen(function* () {
					const url = yield* fileUrl(resolved)
					yield* playUrl(url, volume)
				}),
			)
		},
		[directory, runtime],
	)

	const emit = useCallback(
		(due: DueEvent) => {
			if (!sound) return
			const file =
				audioMap.find((entry) => entry.event === due.event)?.file ?? null
			if (file !== null) playFile(file, due.volume)
		},
		[sound, audioMap, playFile],
	)

	// Auto-next and looping are mutually exclusive: a looping clock wraps before
	// it ever reaches the end of the action, so auto-next overrides the loop
	// preference instead of overwriting it — turning auto-next back off restores
	// whatever the user had stored.
	const cycling = cycleVariants && (action?.variants.length ?? 0) > 1
	const looping = loop && !autoNext && !cycling
	const playback = usePlayback({
		document,
		clip: clip ?? NO_CLIP,
		emit,
		loop: looping,
		soundName,
	})
	const displayScale = clipDisplayScale(clip ?? NO_CLIP, reducedSize)

	useEffect(() => {
		void runtime.runPromise(stopAll())
	}, [runtime, clip, soundName, sound, playback.playing])

	const bounds: Box | undefined = useMemo(
		() => (clip === undefined ? undefined : clipBoundsFrames(document, clip)),
		[document, clip],
	)

	/**
	 * Auto-next: play the action once, then go straight on to the next one in
	 * the action list, wrapping around at the end.
	 *
	 * With looping off the clock clamps at the clip's last frame, so "reached
	 * the end" is an equality that holds until the playhead moves — one advance
	 * per pass. `restart` is what makes a one-action character work too: the
	 * name does not change, so the playhead has to be rewound for the next pass
	 * to have somewhere to go.
	 */
	useEffect(() => {
		const duration = clipDuration(clip ?? NO_CLIP)
		if (
			(!autoNext && !cycling) ||
			!playback.playing ||
			duration <= 0 ||
			action === undefined
		)
			return
		if (playback.timeMs < duration) return
		const nextVariant = cycling ? variantIndex + 1 : action.variants.length
		if (nextVariant < action.variants.length) {
			setSelection({ actionId: action.id, variantIndex: nextVariant })
		} else if (autoNext) {
			const next =
				actions[
					(actions.findIndex((a) => a.id === action.id) + 1) % actions.length
				]
			setSelection({ actionId: next?.id ?? action.id, variantIndex: 0 })
		} else if (loop) {
			setSelection({ actionId: action.id, variantIndex: 0 })
		} else return
		setSoundIndex(0)
		playback.restart()
	}, [
		autoNext,
		cycling,
		clip,
		action,
		actions,
		variantIndex,
		loop,
		playback.restart,
		playback.timeMs,
		playback.playing,
	])

	if (clip === undefined) {
		return (
			<div className="flex size-full items-center justify-center">
				<span className="text-muted-foreground text-xs">{t("error.load")}</span>
			</div>
		)
	}

	return (
		<div className="flex size-full min-h-0 bg-background text-foreground">
			<main className="flex min-w-0 flex-1 flex-col">
				{action !== undefined && variant !== undefined ? (
					<div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2 text-xs">
						<CoverButton
							key={document.id}
							capture={() => {
								playback.seek(playback.timeMs)
								return captureFrame({
									document,
									clip,
									timeMs: playback.timeMs,
									atlasImages,
									displayScale,
								})
							}}
						/>
						<select
							className="max-w-64 rounded border border-border bg-background px-2 py-1"
							aria-label={t("inspect.action")}
							value={action.id}
							onChange={(event) => selectAction(event.target.value)}
						>
							{actions.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
						{action.variants.length > 1 ? (
							<>
								<select
									className="rounded border border-border bg-background px-2 py-1"
									aria-label={t("variants.choose")}
									value={cycleVariants ? "cycle" : variantIndex}
									onChange={(event) => {
										const cycling = event.target.value === "cycle"
										setCycleVariants(cycling)
										if (!cycling)
											setSelection({
												actionId: action.id,
												variantIndex: Number(event.target.value),
											})
										setSoundIndex(0)
									}}
								>
									<option value="cycle">{t("variants.cycle")}</option>
									{action.variants.map((v, index) => (
										<option key={v.clip} value={index}>
											{t("variants.number", { index: index + 1 })}
										</option>
									))}
								</select>
								<span
									className="tabular-nums"
									data-testid="inspector-variant-counter"
								>
									{variantIndex + 1}/{action.variants.length}
								</span>
							</>
						) : null}
						{variant.sounds.length > 1 ? (
							<label className="flex items-center gap-2">
								{t("variants.audio")}
								<select
									className="rounded border border-border bg-background px-2 py-1"
									aria-label={t("variants.audio")}
									value={soundIndex}
									onChange={(event) =>
										setSoundIndex(Number(event.target.value))
									}
								>
									{variant.sounds.map((v, index) => (
										<option key={v.name} value={index}>
											{t("variants.number", { index: index + 1 })}
										</option>
									))}
								</select>
							</label>
						) : null}
						{document.actions ? (
							<details className="ml-auto max-w-80">
								<summary className="cursor-pointer text-muted-foreground">
									{t("variants.origins")}
								</summary>
								{variant.sources.map((s) => (
									<div
										key={`${s.characterId}:${s.clipName}`}
										className="break-all pt-1"
									>
										{s.characterId} · {s.clipName}
									</div>
								))}
							</details>
						) : null}
					</div>
				) : null}
				<div className="relative min-h-0 flex-1">
					<div className="absolute inset-0">
						<Stage
							document={document}
							clip={clip}
							timeMs={playback.timeMs}
							atlasImages={atlasImages}
							bounds={bounds}
							displayScale={displayScale}
						/>
					</div>
				</div>
				<Timeline
					document={document}
					clip={clip}
					timeMs={playback.timeMs}
					bounds={bounds}
					displayScale={displayScale}
					atlasImages={atlasImages}
					onTime={(time) => {
						void runtime.runPromise(stopAll())
						playback.seek(time)
					}}
				/>
				<ControlBar
					reducedSize={reducedSize}
					onReducedSize={onReducedSize}
					clip={clip}
					timeMs={playback.timeMs}
					playing={playback.playing}
					onToggle={playback.toggle}
					onRestart={playback.restart}
					mode={mode}
					onMode={onMode}
					picker={picker}
				/>
			</main>

			{showActions ? (
				<aside className="flex w-sidebar min-w-0 flex-col border-border border-r">
					<ActionList
						document={document}
						value={action?.id ?? ""}
						onChange={selectAction}
					/>
				</aside>
			) : null}

			{showPanel ? (
				<aside className="flex w-panel min-w-0 flex-col border-border border-l">
					<FrameInspector
						document={document}
						clip={clip}
						soundName={soundName}
						timeMs={playback.timeMs}
						audioMap={audioMap}
						audioEnabled={sound}
						onAudioEnabled={setSound}
						loop={loop && !autoNext}
						onLoop={setLoop}
						autoNext={autoNext}
						onAutoNext={setAutoNext}
						onPlayFile={playFile}
					/>
				</aside>
			) : null}
		</div>
	)
}
