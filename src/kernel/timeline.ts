/**
 * Frame sampling — the heart of the viewer.
 *
 * Character animations are *frame* animations: every clip is a set of 5 draw
 * layers, each with a sprite-swap curve plus position/scale/euler curves, all
 * sampled at the clip's frame rate (30 fps). Sampling is deliberately
 * step-wise for sprites (a sprite key holds until the next one) and linear for
 * the transform curves.
 */

import type {
	Affine,
	CharacterDocument,
	Clip,
	CurveKind,
	CurveTrack,
	LayerConstants,
	LayerDraw,
	LayerInfo,
	SpriteKey,
	SpriteRecord,
	SpriteTrack,
	Track,
	Vec2,
	Vec3,
} from "./types"
import { CURVE_KINDS } from "./types"

/** Sprite swaps are stepped; the epsilon keeps a key at exactly `t` inclusive. */
const EPSILON = 1e-6

const IDENTITY_POSITION: Vec3 = [0, 0, 0]
const IDENTITY_SCALE: Vec3 = [1, 1, 1]

export const isCurveKind = (value: string): value is CurveKind =>
	CURVE_KINDS.some((kind) => kind === value)

export const isSpriteTrack = (track: Track): track is SpriteTrack =>
	track.kind === "sprite"

export const clipDuration = (clip: Clip): number =>
	Math.max(
		clip.durationMs,
		clip.frameCount > 0 ? (clip.frameCount / clip.sampleRate) * 1000 : 0,
	)

export const clipByName = (
	document: CharacterDocument,
	name: string,
): Clip | undefined => document.clips.find((clip) => clip.name === name)

export const defaultClip = (document: CharacterDocument): Clip | undefined =>
	clipByName(document, "C_idle") ?? document.clips.at(0)

/**
 * The action after `name` in list order, wrapping at the end.
 *
 * "The next action" is a property of the list rather than of a clip, so the
 * viewer's auto-next asks for it here: the last action is followed by the
 * first, and a name the list does not hold (the viewer's empty selection)
 * starts from the top.
 */
export const nextClipName = (
	clips: readonly Clip[],
	name: string,
): string | undefined => {
	const index = clips.findIndex((clip) => clip.name === name)
	return clips.at(index + 1)?.name ?? clips.at(0)?.name
}

export const layerInfos = (document: CharacterDocument): readonly LayerInfo[] =>
	document.layers

/** The value of a scalar curve at `timeMs` (constant before the first key). */
export const valueAt = (
	keys: readonly (readonly [number, number])[],
	timeMs: number,
	fallback: number,
): number => {
	const first = keys.at(0)
	if (first === undefined) return fallback
	return keys.reduce<number>(
		(accumulated, [time, value]) =>
			time <= timeMs + EPSILON ? value : accumulated,
		first[1],
	)
}

/** The sprite a layer shows at `timeMs`; `null` means the layer is not drawn. */
export const spriteAt = (
	keys: readonly SpriteKey[],
	timeMs: number,
): string | null => {
	const first = keys.at(0)
	if (first === undefined) return null
	return keys.reduce<string | null>(
		(accumulated, [time, sprite]) =>
			time <= timeMs + EPSILON ? sprite : accumulated,
		first[1],
	)
}

const vecAt = (
	curves: readonly (readonly (readonly [number, number])[])[],
	timeMs: number,
	fallback: Vec3,
): Vec3 => [
	valueAt(curves.at(0) ?? [], timeMs, fallback[0]),
	valueAt(curves.at(1) ?? [], timeMs, fallback[1]),
	valueAt(curves.at(2) ?? [], timeMs, fallback[2]),
]

const constantsOf = (clip: Clip, layer: string): LayerConstants =>
	clip.constants[layer] ?? {}

const IDENTITY_MATRIX: Affine = [1, 0, 0, 1, 0, 0]

const matrixAt = (
	clip: Clip,
	layer: string,
	timeMs: number,
): Affine | undefined => {
	const track = curveTrack(clip, layer, "matrix")
	return track === undefined
		? undefined
		: [
				valueAt(track.curves[0] ?? [], timeMs, IDENTITY_MATRIX[0]),
				valueAt(track.curves[1] ?? [], timeMs, IDENTITY_MATRIX[1]),
				valueAt(track.curves[2] ?? [], timeMs, IDENTITY_MATRIX[2]),
				valueAt(track.curves[3] ?? [], timeMs, IDENTITY_MATRIX[3]),
				valueAt(track.curves[4] ?? [], timeMs, IDENTITY_MATRIX[4]),
				valueAt(track.curves[5] ?? [], timeMs, IDENTITY_MATRIX[5]),
			]
}

const styleAt = (
	clip: Clip,
	layer: string,
	timeMs: number,
	fallbackOrder: number,
) => ({
	matrix: matrixAt(clip, layer, timeMs),
	opacity: Math.min(
		1,
		Math.max(
			0,
			valueAt(curveTrack(clip, layer, "opacity")?.curves[0] ?? [], timeMs, 1),
		),
	),
	color: vecAt(
		curveTrack(clip, layer, "color")?.curves ?? [],
		timeMs,
		[1, 1, 1],
	),
	order: valueAt(
		curveTrack(clip, layer, "order")?.curves[0] ?? [],
		timeMs,
		fallbackOrder,
	),
})

const curveTrack = (
	clip: Clip,
	layer: string,
	kind: CurveKind,
): CurveTrack | undefined =>
	clip.tracks.find((track) => track.layer === layer && track.kind === kind) as
		| CurveTrack
		| undefined

/** One layer's resolved transform: animated curves win, constants fill in. */
const transformOf = (
	clip: Clip,
	layer: string,
	timeMs: number,
): { position: Vec2; scale: Vec2; rotation: number } => {
	const constants = constantsOf(clip, layer)
	const position = vecAt(
		curveTrack(clip, layer, "position")?.curves ?? [],
		timeMs,
		constants.position ?? IDENTITY_POSITION,
	)
	const scale = vecAt(
		curveTrack(clip, layer, "scale")?.curves ?? [],
		timeMs,
		constants.scale ?? IDENTITY_SCALE,
	)
	const rotation = valueAt(
		curveTrack(clip, layer, "euler")?.curves.at(2) ?? [],
		timeMs,
		constants.euler?.[2] ?? 0,
	)
	return {
		position: [position[0], position[1]],
		scale: [scale[0], scale[1]],
		rotation,
	}
}

/**
 * Every layer of a clip resolved at `timeMs`, in draw order.
 *
 * The sprite curves decide which layers are drawn (a `null` sprite hides the
 * layer); the transform curves and the clip constants place them. A layer whose
 * scale collapsed to zero is dropped — that is how the game hides a layer it
 * still keys.
 */
export const createFrameSampler = (
	document: CharacterDocument,
	clip: Clip,
): ((timeMs: number) => readonly LayerDraw[]) => {
	const spriteIndex = new Map(
		document.sprites.map((sprite) => [sprite.name, sprite]),
	)
	const orderOf = new Map(
		document.layers.map((layer) => [
			layer.name,
			layer.sortingLayer * 1000 + layer.sortingOrder * 10 + layer.z * 100,
		]),
	)

	const spriteTracks = clip.tracks.filter(isSpriteTrack)
	return (timeMs) =>
		spriteTracks
			.flatMap((track) => {
				const spriteName = spriteAt(track.keys, timeMs)
				const sprite =
					spriteName === null ? undefined : spriteIndex.get(spriteName)
				if (sprite === undefined) return []
				const transform = transformOf(clip, track.layer, timeMs)
				const style =
					document.schemaVersion >= 2
						? styleAt(clip, track.layer, timeMs, orderOf.get(track.layer) ?? 0)
						: undefined
				const matrix = style?.matrix
				if (style?.opacity === 0) return []
				if (
					matrix
						? Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-12
						: transform.scale[0] === 0 || transform.scale[1] === 0
				)
					return []
				const resolved = matrix
					? {
							position: [matrix[4], matrix[5]] satisfies Vec2,
							scale: [
								Math.hypot(matrix[0], matrix[1]),
								Math.sign(matrix[0] * matrix[3] - matrix[1] * matrix[2]) *
									Math.hypot(matrix[2], matrix[3]),
							] satisfies Vec2,
							rotation: (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI,
						}
					: transform
				return [
					{
						layer: track.layer,
						sprite,
						position: resolved.position,
						scale: resolved.scale,
						rotation: resolved.rotation,
						order: orderOf.get(track.layer) ?? 0,
						...style,
					} satisfies LayerDraw,
				]
			})
			.sort((left, right) => left.order - right.order)
}

export const layersAt = (
	document: CharacterDocument,
	clip: Clip,
	timeMs: number,
): readonly LayerDraw[] => createFrameSampler(document, clip)(timeMs)

/** Sprite names a clip can show, in first-appearance order (for the contact sheet). */
export const clipSpriteNames = (clip: Clip): readonly string[] => {
	const names = clip.tracks
		.filter(isSpriteTrack)
		.flatMap((track) => track.keys.map(([, sprite]) => sprite))
		.filter((sprite): sprite is string => sprite !== null)
	return [...new Set(names)]
}

/** Total distinct frames a clip plays, used for the frame counter in the UI. */
export const clipFrameTotal = (clip: Clip): number =>
	Math.max(
		clip.frameCount,
		Math.round(clipDuration(clip) / (1000 / clip.sampleRate)),
	)

export const spriteByName = (
	document: CharacterDocument,
	name: string,
): SpriteRecord | undefined =>
	document.sprites.find((sprite) => sprite.name === name)
