/**
 * Sound-event scheduling and clip grouping.
 *
 * The character config fires sound events on *frames*, not milliseconds
 * (`sounds[].frames[].frame` at the clip's 30 fps), so playback has to work out
 * which frames a playhead crossed — including the wrap at the loop point.
 */

import { clipDuration } from "./timeline"
import type { Clip, ClipGroup, SoundEvent, SoundFrame } from "./types"
import { CLIP_GROUPS } from "./types"

const EPSILON = 1e-6

/** The config's gain for one event of a frame (1.0 when it set no gain). */
const volumeOf = (frame: SoundFrame, index: number): number =>
	frame.volumes?.[index] ?? 1

export type DueEvent = {
	readonly frame: number
	readonly event: string
	/** Export gain: gains above 1 are legitimate, so they are not clamped here. */
	readonly volume: number
	readonly sound: string
}

export const frameToMs = (frame: number, sampleRate: number): number =>
	sampleRate > 0 ? (frame / sampleRate) * 1000 : 0

/** Events whose frame falls in `(fromMs, toMs]`, wrapping when the loop rolled. */
export const dueEvents = (
	sounds: readonly SoundEvent[],
	clip: Clip,
	fromMs: number,
	toMs: number,
): readonly DueEvent[] => {
	const duration = clipDuration(clip)
	const wrapped = toMs < fromMs
	const intervals: readonly (readonly [number, number])[] = wrapped
		? [
				[fromMs, duration],
				[-EPSILON * 2, toMs],
			]
		: [[fromMs, toMs]]
	const inInterval = (timeMs: number): boolean =>
		intervals.some(
			([start, end]) => timeMs > start + EPSILON && timeMs <= end + EPSILON,
		)

	return sounds
		.flatMap((sound) =>
			sound.frames.flatMap((entry) => {
				const timeMs = frameToMs(entry.frame, clip.sampleRate)
				return inInterval(timeMs)
					? entry.events.map((event, index) => ({
							frame: entry.frame,
							event,
							volume: volumeOf(entry, index),
							sound: sound.name,
						}))
					: []
			}),
		)
		.sort((left, right) => left.frame - right.frame)
}

/** Events that fire at a single frame (used when scrubbing frame by frame). */
export const eventsAtFrame = (
	sounds: readonly SoundEvent[],
	frame: number,
): readonly DueEvent[] =>
	sounds.flatMap((sound) =>
		sound.frames
			.filter((entry) => entry.frame === frame)
			.flatMap((entry) =>
				entry.events.map((event, index) => ({
					frame,
					event,
					volume: volumeOf(entry, index),
					sound: sound.name,
				})),
			),
	)

export type ClipCategory = ClipGroup

const GROUP_SET: ReadonlySet<string> = new Set(CLIP_GROUPS)

/** The bucket a clip belongs to, defaulting when the export left it unlabelled. */
export const categorize = (clip: Clip): ClipCategory =>
	clip.group !== undefined && GROUP_SET.has(clip.group) ? clip.group : "other"

export const CATEGORY_ORDER: readonly ClipCategory[] = CLIP_GROUPS

export type ClassifiedClip = {
	readonly clip: Clip
	readonly category: ClipCategory
}

export const classifyClips = (
	clips: readonly Clip[],
): readonly ClassifiedClip[] =>
	clips
		.map((clip) => ({ clip, category: categorize(clip) }))
		.sort((left, right) => {
			const byCategory =
				CATEGORY_ORDER.indexOf(left.category) -
				CATEGORY_ORDER.indexOf(right.category)
			return byCategory !== 0
				? byCategory
				: left.clip.name.localeCompare(right.clip.name)
		})

/** Names of the clips a character exposes, grouped for the picker. */
export const clipsByCategory = (
	clips: readonly Clip[],
): readonly (readonly [ClipCategory, readonly Clip[]])[] => {
	const classified = classifyClips(clips)
	return CATEGORY_ORDER.map(
		(category) =>
			[
				category,
				classified
					.filter((item) => item.category === category)
					.map((item) => item.clip),
			] as const,
	).filter(([, items]) => items.length > 0)
}
