import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@hoardodile/ui/components/empty"
import { Skeleton } from "@hoardodile/ui/components/skeleton"
import { Effect } from "effect"
import { useCallback, useEffect, useMemo, useState } from "react"

import { stopAll } from "../boundary/audio"
import type {
	AudioMap,
	CatalogDocument,
	CharacterDocument,
} from "../boundary/documents"
import { classifyResource } from "../boundary/documents"
import type { ViewerRuntime } from "../boundary/layer"
import {
	audioMapPath,
	catalogPath,
	characterPath,
	loadAudioMapOptional,
	loadDocument,
	makeRuntime,
} from "../boundary/layer"
import { loadCatalog } from "../boundary/resource"
import { usePluginAPI } from "../hooks"
import { useTranslation } from "../i18n"
import { CharacterPicker } from "./CharacterPicker"
import { characterDirectory } from "./characterPaths"
import { CharacterInspector } from "./inspect/CharacterInspector"
import type { ViewMode } from "./ModeToggle"
import { PreviewGrid } from "./preview/PreviewGrid"
import { useReducedSizePref, useViewModePref } from "./useViewerPrefs"

type LoadedCharacter = {
	readonly document: CharacterDocument
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly audioMap: AudioMap
}

type LoadState =
	| { readonly status: "loading" }
	| { readonly status: "error"; readonly message: string }
	| ({ readonly status: "ready" } & LoadedCharacter)

/**
 * The plugin's one surface.
 *
 * It resolves what the resource is, loads the chosen character once, and hands
 * it to either view: the preview (every action playing at once, no audio) or the
 * inspector. Each view owns its own layout and bottom control bar, and the view
 * switch lives in that bar, so there is no chrome above the artwork. Only the
 * inspector ever sees the audio map, and only the inspector can emit sound.
 *
 * Which view is open is a **preference**, not component state: a fresh install
 * opens on the preview, and every later visit lands wherever the user left off.
 */
export function CharacterView() {
	const api = usePluginAPI()
	const { t } = useTranslation()
	const [mode, setMode] = useViewModePref()
	const [reducedSize, setReducedSize] = useReducedSizePref()

	const runtime: ViewerRuntime = useMemo(
		() =>
			makeRuntime({
				readBytes: (path: string) => api.readFile(path),
				resolveFileUrl: (path: string) => api.resolveFileUrl(path),
			}),
		[api],
	)
	useEffect(() => () => void runtime.dispose(), [runtime])

	const kind = useMemo(
		() => classifyResource(api.resource.sourceMeta?.files ?? []),
		[api.resource.sourceMeta],
	)
	const [catalog, setCatalog] = useState<CatalogDocument | null>(null)
	const [picked, setPicked] = useState<string | null>(null)
	const [state, setState] = useState<LoadState>({ status: "loading" })

	const selectedId =
		kind?.kind === "collection"
			? (catalog?.characters.find((entry) => entry.id === picked)?.id ??
				catalog?.characters.at(0)?.id ??
				null)
			: null

	// A collection holds many characters: read the catalog, then let the user
	// pick which one to load.
	useEffect(() => {
		if (kind?.kind !== "collection") return undefined
		let cancelled = false
		runtime.runPromise(loadCatalog(catalogPath(kind.path))).then(
			(loaded) => {
				if (!cancelled) setCatalog(loaded)
			},
			(error: unknown) => {
				if (!cancelled) setState({ status: "error", message: String(error) })
			},
		)
		return () => {
			cancelled = true
		}
	}, [kind, runtime])

	const directory = useMemo(
		() =>
			characterDirectory(
				kind,
				selectedId,
				catalog?.characters.find((entry) => entry.id === selectedId)?.directory,
			),
		[kind, selectedId, catalog],
	)

	/**
	 * A collection needs a character picker; it belongs in the bottom control
	 * bar next to the view switch, alongside the transport both views share.
	 */
	const picker = useMemo(
		() =>
			kind?.kind === "collection" && catalog !== null ? (
				<CharacterPicker
					catalog={catalog}
					selectedId={selectedId}
					onSelect={setPicked}
				/>
			) : undefined,
		[kind, catalog, selectedId],
	)

	// The audio map is a large flat list of resolved samples, and the preview
	// never plays one, so it is only read once the inspector is open.
	const withAudio = mode === "inspect"
	useEffect(() => {
		if (kind === undefined) return undefined
		if (kind.kind === "collection" && selectedId === null) return undefined
		let cancelled = false
		setState({ status: "loading" })
		runtime
			.runPromise(
				Effect.gen(function* () {
					const loaded = yield* loadDocument(characterPath(directory))
					const audioMap = withAudio
						? yield* loadAudioMapOptional(audioMapPath(directory))
						: []
					return { ...loaded, audioMap } satisfies LoadedCharacter
				}),
			)
			.then(
				(loaded) => {
					if (!cancelled) setState({ status: "ready", ...loaded })
				},
				(error: unknown) => {
					if (!cancelled) setState({ status: "error", message: String(error) })
				},
			)
		return () => {
			cancelled = true
		}
	}, [directory, kind, runtime, selectedId, withAudio])

	const switchMode = useCallback(
		(next: ViewMode) => {
			setMode(next)
			// Nothing in the preview may keep playing, and a stale sample from
			// the inspector would follow the user back into it.
			void runtime.runPromise(stopAll())
		},
		[runtime],
	)

	if (kind === undefined) {
		return (
			<div className="flex size-full items-center justify-center p-6">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{t("error.notCharacter")}</EmptyTitle>
						<EmptyDescription>{t("error.notCharacterHint")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		)
	}

	return (
		<div className="flex size-full min-h-0 flex-col bg-background text-foreground">
			{state.status === "error" ? (
				<div className="flex min-h-0 flex-1 items-center justify-center p-6">
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{t("error.load")}</EmptyTitle>
							<EmptyDescription>{state.message}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</div>
			) : state.status === "loading" ? (
				<div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
					<Skeleton className="h-control w-full" />
					<Skeleton className="min-h-0 flex-1" />
				</div>
			) : state.document.clips.length === 0 ? (
				<NoActions document={state.document} />
			) : mode === "preview" ? (
				<PreviewGrid
					reducedSize={reducedSize}
					onReducedSize={setReducedSize}
					document={state.document}
					atlasImages={state.atlasImages}
					mode={mode}
					onMode={switchMode}
					picker={picker}
				/>
			) : (
				<CharacterInspector
					reducedSize={reducedSize}
					onReducedSize={setReducedSize}
					document={state.document}
					atlasImages={state.atlasImages}
					audioMap={state.audioMap}
					directory={directory}
					runtime={runtime}
					mode={mode}
					onMode={switchMode}
					picker={picker}
				/>
			)}
		</div>
	)
}

/**
 * What a character export without animations gets.
 *
 * Some rigs ship their sprites, atlas pages and sound events but no clips at
 * all — the portraits in an export tree are exactly that, and a half-finished
 * export looks the same. Saying so *is* the whole view: the alternative was an
 * empty preview grid and a "could not load this character" panel in inspect,
 * which reads as a broken plugin rather than an export with nothing to play.
 */
function NoActions({ document }: { readonly document: CharacterDocument }) {
	const { t } = useTranslation()
	return (
		<div className="flex size-full items-center justify-center p-6">
			<Empty>
				<EmptyHeader>
					<EmptyTitle>{t("error.noActions")}</EmptyTitle>
					<EmptyDescription>
						{t("error.noActionsHint", {
							sprites: document.sprites.length,
							atlases: document.atlases.length,
						})}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	)
}
