import type { ResourceAPI } from "@hoardodile/sdk-server"
import { definePlugin } from "@hoardodile/sdk-server"
import { extname } from "@hoardodile/sdk-server/helpers"
import type { FrameFile, FrameSchema, FrameSourceMeta } from "./shared"

const CHARACTER_FILE = "character.json"
const CATALOG_FILE = "catalog.json"

type ResourceKind = "character" | "collection"

type CharacterDocumentShape = {
	readonly id?: string
	readonly name?: string | null
	readonly atlases?: readonly unknown[]
	readonly stats?: {
		readonly sprites?: number
		readonly clips?: number
		readonly actions?: number
		readonly soundEvents?: number
		readonly maxClipMs?: number
	}
	readonly audio?: { readonly events?: number; readonly resolved?: number }
}

type CatalogShape = {
	readonly counts?: {
		readonly characters?: number
		readonly portraits?: number
		readonly bytes?: number
	}
}

/**
 * Classify a resource from its file list.
 *
 * A character export is one self-contained folder (`character.json` at its
 * root), which is what lets a user keep a handful of folders and delete the
 * rest. A collection is the whole export tree (`catalog.json` plus
 * `characters/<id>/…`), which is what makes the offline workbench browsable.
 */
const classify = (files: readonly string[]): ResourceKind | undefined => {
	const hasRoot = (name: string) => files.includes(name)
	if (hasRoot(CATALOG_FILE)) return "collection"
	if (hasRoot(CHARACTER_FILE)) return "character"
	if (files.some((file) => file.endsWith(`/${CATALOG_FILE}`)))
		return "collection"
	if (files.some((file) => file.endsWith(`/${CHARACTER_FILE}`)))
		return "character"
	return undefined
}

const documentPath = (
	files: readonly string[],
	name: string,
): string | undefined =>
	files.includes(name) ? name : files.find((file) => file.endsWith(`/${name}`))

const decodeJson = <T>(bytes: Uint8Array): T | undefined => {
	try {
		return JSON.parse(new TextDecoder("utf-8").decode(bytes)) as T
	} catch {
		return undefined
	}
}

const fileKind = (path: string): FrameFile["kind"] => {
	if (
		path === CHARACTER_FILE ||
		path === CATALOG_FILE ||
		path.endsWith(AUDIO_MAP_SUFFIX)
	) {
		return "document"
	}
	const extension = extname(path)
	if (extension === ".png" || extension === ".webp") return "atlas"
	if (extension === ".ogg" || extension === ".wav" || extension === ".m4a")
		return "audio"
	return "other"
}

const AUDIO_MAP_SUFFIX = "audio-map.json"

export default definePlugin<FrameSchema>({
	detect: async (api) => {
		const files = await api.listFileNames()
		const resource = classify(files)
		if (resource === undefined) {
			return { ok: false, reasons: ["no character.json or catalog.json"] }
		}
		const path = resource === "character" ? CHARACTER_FILE : CATALOG_FILE
		const resolved = documentPath(files, path)
		// A self-contained folder is itself the character; only a nested
		// `characters/<id>/character.json` carries a usable id here.
		const id =
			resource === "character" &&
			resolved !== undefined &&
			resolved !== CHARACTER_FILE
				? resolved.slice(0, -`/${CHARACTER_FILE}`.length)
				: undefined
		return { ok: true, resource, id, files: files.length }
	},
	sourceMeta: buildSourceMeta,
	coverLocal: async (api) => {
		const files = await api.listFileNames()
		return files.includes("cover.png") ? "cover.png" : undefined
	},
	listFiles: async (api): Promise<readonly FrameFile[]> => {
		const files = await api.listFileNames()
		return files.map((path) => ({ path, kind: fileKind(path) }))
	},
})

async function buildSourceMeta(
	api: ResourceAPI<FrameSchema>,
): Promise<FrameSourceMeta> {
	const files = await api.listFileNames()
	const resource =
		api.context.detect?.resource ?? classify(files) ?? "character"

	if (resource === "collection") {
		const path = documentPath(files, CATALOG_FILE)
		const catalog =
			path === undefined
				? undefined
				: decodeJson<CatalogShape>(await api.readFile(path))
		return {
			resource,
			files,
			collection: {
				characters: catalog?.counts?.characters ?? 0,
				portraits: catalog?.counts?.portraits ?? 0,
				bytes: catalog?.counts?.bytes ?? 0,
			},
		}
	}

	const path = documentPath(files, CHARACTER_FILE)
	const document =
		path === undefined
			? undefined
			: decodeJson<CharacterDocumentShape>(await api.readFile(path))
	return {
		resource,
		files,
		character: {
			id: document?.id ?? api.context.detect?.id ?? "",
			name: document?.name ?? null,
			sprites: document?.stats?.sprites ?? 0,
			clips: document?.stats?.actions ?? document?.stats?.clips ?? 0,
			soundEvents: document?.stats?.soundEvents ?? 0,
			maxClipMs: document?.stats?.maxClipMs ?? 0,
			atlases: document?.atlases?.length ?? 0,
			audioResolved: document?.audio?.resolved ?? 0,
			audioEvents: document?.audio?.events ?? 0,
		},
	}
}
