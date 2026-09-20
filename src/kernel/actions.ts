/** Action families are declared by the export; legacy clips each form one action. */
import { CATEGORY_ORDER } from "./events"
import { clipDuration } from "./timeline"
import type { CharacterDocument, Clip, ModelAction } from "./types"

export const modelActions = (
	document: CharacterDocument,
): readonly ModelAction[] =>
	(
		document.actions ??
		document.clips.map((clip) => ({
			id: clip.name,
			name: clip.name,
			group: clip.group ?? "other",
			added: false,
			variants: [
				{
					clip: clip.name,
					sources: [{ characterId: document.id, clipName: clip.name }],
					sounds: [
						{
							name: clip.name,
							sources: [{ characterId: document.id, clipName: clip.name }],
						},
					],
				},
			],
		}))
	).toSorted(
		(a, b) =>
			CATEGORY_ORDER.indexOf(a.group) - CATEGORY_ORDER.indexOf(b.group) ||
			a.name.localeCompare(b.name),
	)

export const variantClips = (
	document: CharacterDocument,
	action: ModelAction,
): readonly Clip[] =>
	action.variants.flatMap((v) =>
		document.clips.filter((c) => c.name === v.clip),
	)

export const actionHasDifferences = (action: ModelAction): boolean =>
	action.added ||
	action.variants.length > 1 ||
	action.variants.some((v) => v.sounds.length > 1)

/** Unequal clip lengths keep their original time; switching happens only at the boundary. */
export const actionFrameAt = (
	clips: readonly Clip[],
	elapsed: number,
	fixed?: number,
):
	| { readonly clip: Clip; readonly index: number; readonly timeMs: number }
	| undefined => {
	const total = clips.reduce((sum, clip) => sum + clipDuration(clip), 0)
	const selected = fixed === undefined ? undefined : clips[fixed]
	if (selected !== undefined)
		return {
			clip: selected,
			index: fixed ?? 0,
			timeMs:
				clipDuration(selected) > 0
					? Math.max(0, elapsed) % clipDuration(selected)
					: 0,
		}
	if (clips.length === 0 || total <= 0) return undefined
	const time = ((elapsed % total) + total) % total
	const endTimes = clips.map((_, index) =>
		clips.slice(0, index + 1).reduce((sum, c) => sum + clipDuration(c), 0),
	)
	const index = endTimes.findIndex((end) => time < end)
	const clip = clips[index]
	return clip === undefined
		? undefined
		: { clip, index, timeMs: time - (endTimes[index - 1] ?? 0) }
}
