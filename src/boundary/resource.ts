/**
 * Boundary: everything that touches the host, the network or the DOM.
 *
 * The kernel is pure; this module is where impurity is allowed to exist, and
 * only through Effect. Files come from the plugin API (sandboxed, tokenized
 * URLs), are decoded with Effect Schema, and land in the kernel as typed
 * documents.
 */

import { Context, Effect, Layer, Result, Schema } from "effect"

import type { AudioMap, CatalogDocument, CharacterDocument } from "./documents"
import {
	AudioMapSchema,
	CatalogDocumentSchema,
	CharacterDocumentSchema,
} from "./schema"

export class FileReadError extends Schema.TaggedError<FileReadError>()(
	"FileReadError",
	{
		path: Schema.String,
		detail: Schema.String,
	},
) {}

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>()(
	"DocumentDecodeError",
	{ path: Schema.String, detail: Schema.String },
) {}

export class ImageLoadError extends Schema.TaggedError<ImageLoadError>()(
	"ImageLoadError",
	{
		path: Schema.String,
		detail: Schema.String,
	},
) {}

/** The host surface the boundary needs — exactly `WebPluginAPI`'s file part. */
export type ResourceAccessShape = {
	readonly readBytes: (path: string) => Promise<ArrayBuffer>
	readonly resolveFileUrl: (path: string) => string
}

export class ResourceAccess extends Context.Service<
	ResourceAccess,
	ResourceAccessShape
>()("frame/ResourceAccess") {}

export const makeResourceAccess = (
	shape: ResourceAccessShape,
): Layer.Layer<ResourceAccess> => Layer.succeed(ResourceAccess, shape)

const decodeText = new TextDecoder("utf-8")

export const readBytes = (
	path: string,
): Effect.Effect<ArrayBuffer, FileReadError, ResourceAccess> =>
	Effect.gen(function* () {
		const access = yield* ResourceAccess
		return yield* Effect.tryPromise({
			try: () => access.readBytes(path),
			catch: (cause) => new FileReadError({ path, detail: String(cause) }),
		})
	})

export const readJson = (
	path: string,
): Effect.Effect<
	unknown,
	FileReadError | DocumentDecodeError,
	ResourceAccess
> =>
	Effect.gen(function* () {
		const buffer = yield* readBytes(path)
		return yield* Effect.try({
			try: () => JSON.parse(decodeText.decode(buffer)) as unknown,
			catch: (cause) =>
				new DocumentDecodeError({
					path,
					detail: `invalid JSON: ${String(cause)}`,
				}),
		})
	})

/**
 * Decode with a prepared `decodeUnknownResult` decoder rather than the
 * effectful decoder: the latter's service channel is generic
 * (`S["DecodingServices"]`) and would drag an `unknown` requirement through
 * every caller.
 */
const decodeWith = <A>(
	decoder: (input: unknown) => Result.Result<A, unknown>,
	path: string,
	input: unknown,
): Effect.Effect<A, DocumentDecodeError> =>
	Effect.gen(function* () {
		const result = decoder(input)
		if (Result.isFailure(result)) {
			return yield* new DocumentDecodeError({
				path,
				detail: String(result.failure),
			})
		}
		return result.success
	})

export const decodeCharacterDocument = (path: string, input: unknown) =>
	decodeWith(Schema.decodeUnknownResult(CharacterDocumentSchema), path, input)

export const loadCharacter = (
	path: string,
): Effect.Effect<
	CharacterDocument,
	FileReadError | DocumentDecodeError,
	ResourceAccess
> =>
	Effect.gen(function* () {
		const json = yield* readJson(path)
		const decoded = yield* decodeCharacterDocument(path, json)
		return decoded as unknown as CharacterDocument
	})

export const loadCatalog = (
	path: string,
): Effect.Effect<
	CatalogDocument,
	FileReadError | DocumentDecodeError,
	ResourceAccess
> =>
	Effect.gen(function* () {
		const json = yield* readJson(path)
		const decoded = yield* decodeWith(
			Schema.decodeUnknownResult(CatalogDocumentSchema),
			path,
			json,
		)
		return decoded as unknown as CatalogDocument
	})

export const loadAudioMap = (
	path: string,
): Effect.Effect<
	AudioMap,
	FileReadError | DocumentDecodeError,
	ResourceAccess
> =>
	Effect.gen(function* () {
		const json = yield* readJson(path)
		const decoded = yield* decodeWith(
			Schema.decodeUnknownResult(AudioMapSchema),
			path,
			json,
		)
		return decoded as unknown as AudioMap
	})

export const fileUrl = (
	path: string,
): Effect.Effect<string, never, ResourceAccess> =>
	Effect.gen(function* () {
		const access = yield* ResourceAccess
		return access.resolveFileUrl(path)
	})

/**
 * Load an atlas page as a decoded image.
 *
 * Images are fetched through a tokenized host URL rather than `readBytes`: the
 * browser decodes them off the main thread and caches them, which matters when
 * one atlas backs 150 sprites.
 */
export const loadImage = (
	path: string,
): Effect.Effect<HTMLImageElement, ImageLoadError, ResourceAccess> =>
	Effect.gen(function* () {
		const url = yield* fileUrl(path)
		return yield* Effect.tryPromise({
			try: () =>
				new Promise<HTMLImageElement>((resolve, reject) => {
					const image = new Image()
					image.crossOrigin = "anonymous"
					image.onload = () => resolve(image)
					image.onerror = () => reject(new Error("image decode failed"))
					image.src = url
				}),
			catch: (cause) => new ImageLoadError({ path, detail: String(cause) }),
		})
	})

export const loadImages = (
	paths: readonly string[],
): Effect.Effect<
	ReadonlyMap<string, HTMLImageElement>,
	ImageLoadError,
	ResourceAccess
> =>
	Effect.forEach(
		paths,
		(path) =>
			loadImage(path).pipe(Effect.map((image) => [path, image] as const)),
		{
			concurrency: 4,
		},
	).pipe(Effect.map((entries) => new Map(entries)))
