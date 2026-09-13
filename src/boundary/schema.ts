/**
 * Effect Schema boundary: untrusted JSON in, typed kernel documents out.
 *
 * The exported `character.json` / `catalog.json` files are data on disk, so
 * they are decoded rather than cast. A decode failure is a real, reported
 * error (`CharacterLoadError`), never a silent `any`.
 */

import { Schema } from "effect"

const Vec2 = Schema.Tuple([Schema.Number, Schema.Number])
const Vec3 = Schema.Tuple([Schema.Number, Schema.Number, Schema.Number])
const Rect = Schema.Tuple([
	Schema.Number,
	Schema.Number,
	Schema.Number,
	Schema.Number,
])

const SpriteRecord = Schema.Struct({
	name: Schema.String,
	atlas: Schema.String,
	rect: Rect,
	pivot: Vec2,
	pixelsToUnit: Schema.Number,
})

const SpriteKey = Schema.Tuple([Schema.Number, Schema.NullOr(Schema.String)])
const NumericKey = Schema.Tuple([Schema.Finite, Schema.Finite])

const SpriteTrack = Schema.Struct({
	layer: Schema.String,
	kind: Schema.Literal("sprite"),
	keys: Schema.Array(SpriteKey),
})

/**
 * Transform curves carry a known kind; other generic bindings are hashed into
 * `attribute<id>` names, so anything else is accepted and simply not drawn.
 */
const CurveKind = Schema.String.check(
	Schema.makeFilter(
		(kind) => kind !== "sprite" || "Sprite tracks require keys",
	),
)

const CurveTrack = Schema.Struct({
	layer: Schema.String,
	kind: CurveKind,
	curves: Schema.Array(Schema.Array(NumericKey)),
}).check(
	Schema.makeFilter((track) => {
		const dimensions: Readonly<Record<string, number>> = {
			matrix: 6,
			opacity: 1,
			color: 3,
			order: 1,
		}
		const size = dimensions[track.kind]
		return (
			size === undefined ||
			track.curves.length === size ||
			`Invalid ${track.kind} component count`
		)
	}),
)

/**
 * Action buckets the picker groups clips into. Declared as a literal union so a
 * typo in the export is a decode error rather than a silently empty group.
 * Optional on the clip: documents exported before the label existed decode too,
 * and the kernel buckets them under `other`.
 */
const ClipGroup = Schema.Literals([
	"idle",
	"move",
	"attack",
	"skill",
	"damage",
	"state",
	"other",
])

const Clip = Schema.Struct({
	name: Schema.String,
	displayScale: Schema.optional(
		Schema.Number.check(
			Schema.makeFilter(
				(value) => Number.isFinite(value) && value > 0 && value <= 1,
			),
		),
	),
	group: Schema.optional(ClipGroup),
	sampleRate: Schema.Number,
	frameCount: Schema.Number,
	durationMs: Schema.Number,
	tracks: Schema.Array(Schema.Union([SpriteTrack, CurveTrack])),
	constants: Schema.Record(
		Schema.String,
		Schema.Struct({
			position: Schema.optional(Vec3),
			scale: Schema.optional(Vec3),
			euler: Schema.optional(Vec3),
		}),
	),
})

const SoundEvent = Schema.Struct({
	name: Schema.String,
	frames: Schema.Array(
		Schema.Struct({
			frame: Schema.Number,
			events: Schema.Array(Schema.String),
			/** Index-aligned gains; the exporter omits them at 1.0. */
			volumes: Schema.optional(Schema.Array(Schema.Number)),
		}),
	),
})

const LayerInfo = Schema.Struct({
	name: Schema.String,
	sortingOrder: Schema.Number,
	sortingLayer: Schema.Number,
	z: Schema.Number,
})

/**
 * A character-level sound event. Optional because documents exported before the
 * field existed, and characters the source lists no voices for, both omit it.
 */
const VoiceEvent = Schema.Struct({
	name: Schema.String,
	slot: Schema.Number,
	event: Schema.String,
})

const AtlasInfo = Schema.Struct({
	file: Schema.String,
	width: Schema.Number,
	height: Schema.Number,
})

export const CharacterDocumentSchema = Schema.Struct({
	schemaVersion: Schema.Literals([1, 2]),
	id: Schema.String,
	name: Schema.NullOr(Schema.String),
	sourceGroup: Schema.String,
	sourceBundle: Schema.String,
	/**
	 * What the payload is, not which engine wrote it. Optional so documents
	 * exported before the field existed still decode; nothing renders it.
	 */
	sourceFormat: Schema.optional(
		Schema.Struct({
			container: Schema.String,
			version: Schema.Number,
		}),
	),
	atlases: Schema.Array(AtlasInfo),
	sprites: Schema.Array(SpriteRecord),
	clips: Schema.Array(Clip),
	sounds: Schema.Array(SoundEvent),
	voices: Schema.optional(Schema.Array(VoiceEvent)),
	layers: Schema.Array(LayerInfo),
	audio: Schema.Struct({
		events: Schema.Number,
		resolved: Schema.Number,
		unresolved: Schema.Number,
	}),
	stats: Schema.Struct({
		sprites: Schema.Number,
		clips: Schema.Number,
		soundEvents: Schema.Number,
		maxClipMs: Schema.Number,
	}),
})

export const CatalogDocumentSchema = Schema.Struct({
	schemaVersion: Schema.Number,
	counts: Schema.Record(Schema.String, Schema.Number),
	characters: Schema.Array(
		Schema.Struct({
			id: Schema.String,
			name: Schema.NullOr(Schema.String),
			/** Character folder, relative to the catalog's own directory. */
			directory: Schema.optional(Schema.String),
			sprites: Schema.Number,
			clips: Schema.Number,
			soundEvents: Schema.Number,
			bytes: Schema.Number,
			hasCover: Schema.Boolean,
		}),
	),
})

export const AudioMapSchema = Schema.Array(
	Schema.Struct({
		event: Schema.String,
		file: Schema.NullOr(Schema.String),
		match: Schema.String,
	}),
)

/** The subset of kernel types the schemas above produce. */
export type DecodedCharacter = Schema.Schema.Type<
	typeof CharacterDocumentSchema
>
export type DecodedCatalog = Schema.Schema.Type<typeof CatalogDocumentSchema>
export type DecodedAudioMap = Schema.Schema.Type<typeof AudioMapSchema>
