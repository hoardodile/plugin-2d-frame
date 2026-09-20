/**
 * Playhead plus the sound events a clip fires on each frame.
 *
 * The clock and the event scheduling live here, and nowhere else: the frame
 * strip, the stage and the audio panel all read the same `timeMs`, and only
 * this hook decides when an exported sound event is due. A caller that wants
 * the viewer to stay silent never passes `emit`.
 *
 * Looping is *not* owned here — the viewer persists it as a preference and can
 * override it (auto-next plays to the end, which a loop never reaches), so the
 * caller passes the value the clock should use.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { clipDuration, type DueEvent, dueEvents, wrapTime } from "../kernel"
import type { CharacterDocument, Clip } from "../kernel/types"

export type PlaybackOptions = {
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly emit?: (due: DueEvent) => void
	/** Wrap at the clip's end instead of stopping on its last frame. */
	readonly loop?: boolean
	readonly soundName?: string
}

export type Playback = {
	readonly timeMs: number
	readonly playing: boolean
	/** Restart from frame 0 and start playing again. */
	readonly restart: () => void
	/** Move the playhead without firing events (frame strip, dialog). */
	readonly seek: (timeMs: number) => void
	readonly toggle: () => void
}

export const usePlayback = ({
	document,
	clip,
	emit,
	loop = true,
	soundName = clip.name,
}: PlaybackOptions): Playback => {
	const [timeMs, setTimeMs] = useState(0)
	const [playing, setPlaying] = useState(true)
	const timeRef = useRef(0)
	const initialEventsPending = useRef(true)

	const duration = clipDuration(clip)

	const commit = useCallback(
		(next: number) => {
			timeRef.current = next
			setTimeMs(next)
		},
		[setTimeMs],
	)

	// A new action restarts the playhead at frame 0.
	useEffect(() => {
		commit(0)
		initialEventsPending.current = true
	}, [clip, soundName, commit])

	useEffect(() => {
		if (!playing || duration <= 0) return undefined
		let handle = 0
		let last = performance.now()
		const tick = (now: number) => {
			const delta = now - last
			last = now
			const from = timeRef.current
			const next = wrapTime(from + delta, duration, loop)
			if (emit !== undefined) {
				for (const due of dueEvents(
					document.sounds.filter((sound) => sound.name === soundName),
					clip,
					initialEventsPending.current ? -0.001 : from,
					next,
				)) {
					emit(due)
				}
			}
			initialEventsPending.current = false
			commit(next)
			handle = requestAnimationFrame(tick)
		}
		handle = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(handle)
	}, [playing, duration, loop, document, clip, soundName, emit, commit])

	const restart = useCallback(() => {
		commit(0)
		initialEventsPending.current = true
		setPlaying(true)
	}, [commit])

	const seek = useCallback(
		(next: number) => {
			setPlaying(false)
			initialEventsPending.current = false
			commit(next)
		},
		[commit],
	)

	const toggle = useCallback(() => setPlaying((current) => !current), [])

	return {
		timeMs,
		playing,
		restart,
		seek,
		toggle,
	}
}
