/**
 * The viewer's own settings, as hoardodile plugin preferences.
 *
 * The host stores prefs per plugin and hands them back through the iframe
 * context, so a setting the user picks once survives every reload, every
 * resource and every character in a collection. Nothing here is per-resource
 * on purpose: which view is open, "loop the action", "walk the action list"
 * and "play sound" are how this viewer behaves, not facts about one character.
 *
 * Prefs are **strings** end to end, which is why every key carries a codec:
 * without one the stored value comes back as the string `"false"`, and a
 * non-empty string is truthy — the switch would read as on forever.
 */

import { booleanCodec, type Codec } from "@hoardodile/sdk-web"

import { usePluginAPI } from "../hooks"
import type { ViewMode } from "./ModeToggle"

/** One codec instance: the pair is stateless, so every key shares it. */
const BOOLEAN = booleanCodec()

/**
 * Pref keys. They are plugin-scoped already (the host namespaces them by
 * plugin id), so they only name the viewer's own settings.
 */
export const PREF_MODE = "view.mode"
export const PREF_LOOP = "viewer.loop"
export const PREF_AUTO_NEXT = "viewer.autoNext"
export const PREF_SOUND = "viewer.sound"
export const PREF_REDUCED_SIZE = "viewer.reducedSize"

/** A display preference; missing clip annotations continue to use the authored size. */
export const useReducedSizePref = (): readonly [
	boolean,
	(value: boolean) => void,
] => {
	const api = usePluginAPI()
	return api.usePref(PREF_REDUCED_SIZE, true, BOOLEAN)
}

/**
 * The view is a two-value string, so a value the viewer did not write is a
 * missing value rather than something to hand to the toggle as a mode.
 */
const viewModeCodec: Codec<ViewMode> = {
	encode: (value) => value,
	decode: (raw) => (raw === "preview" || raw === "inspect" ? raw : undefined),
}

/** The view a fresh install opens with; the README documents it. */
export const DEFAULT_VIEW_MODE: ViewMode = "preview"

/**
 * Which view the resource opens in, remembered across sessions.
 *
 * The default keeps the documented first-run behaviour (preview), and every
 * later visit lands wherever the user left off.
 */
export const useViewModePref = (): readonly [
	ViewMode,
	(mode: ViewMode) => void,
] => {
	const api = usePluginAPI()
	return api.usePref(PREF_MODE, DEFAULT_VIEW_MODE, viewModeCodec)
}

export type ViewerPrefs = {
	/** Loop the current action instead of stopping at its last frame. */
	readonly loop: boolean
	readonly setLoop: (value: boolean) => void
	/** Play one action, then move on to the next one in the action list. */
	readonly autoNext: boolean
	readonly setAutoNext: (value: boolean) => void
	/** Play the action's exported sound events. */
	readonly sound: boolean
	readonly setSound: (value: boolean) => void
}

/**
 * The three viewer switches, read and written as prefs.
 *
 * Defaults match the viewer's opening state: looping on, auto-next off (the
 * action list is walked only when asked for) and sound off — the viewer never
 * makes noise before the user asks it to.
 */
export const useViewerPrefs = (): ViewerPrefs => {
	const api = usePluginAPI()
	const [loop, setLoop] = api.usePref(PREF_LOOP, true, BOOLEAN)
	const [autoNext, setAutoNext] = api.usePref(PREF_AUTO_NEXT, false, BOOLEAN)
	const [sound, setSound] = api.usePref(PREF_SOUND, false, BOOLEAN)
	return { loop, setLoop, autoNext, setAutoNext, sound, setSound }
}
