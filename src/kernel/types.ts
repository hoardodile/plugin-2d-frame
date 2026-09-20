/**
 * Kernel types — the shape of an exported character, as JSON on disk.
 *
 * Everything here is `readonly`: the kernel never mutates a decoded document,
 * it derives new values from it. The boundary layer (`src/boundary/schema.ts`)
 * is what turns untrusted JSON into these types.
 */

export type Vec2 = readonly [x: number, y: number]
export type Vec3 = readonly [x: number, y: number, z: number]
/** World-space 2D affine transform: x'=a*x+c*y+tx, y'=b*x+d*y+ty. */
export type Affine = readonly [
	a: number,
	b: number,
	c: number,
	d: number,
	tx: number,
	ty: number,
]
export type Rect = readonly [
	x: number,
	y: number,
	width: number,
	height: number,
]

/** One drawable frame: a rect inside an atlas page plus its pivot. */
export type SpriteRecord = {
	readonly name: string
	readonly atlas: string
	readonly rect: Rect
	/** Pivot inside the rect, normalized from the bottom-left; may fall outside. */
	readonly pivot: Vec2
	readonly pixelsToUnit: number
}

/** `[timeMs, spriteName | null]` — null means "this layer is not drawn". */
export type SpriteKey = readonly [timeMs: number, sprite: string | null]
/** `[timeMs, value]` — one scalar curve. */
export type NumericKey = readonly [timeMs: number, value: number]

/**
 * Curve kinds that place a layer: `position`/`scale`/`euler` come from the
 * Transform binding, `rotation` is the quaternion curve (kept, not drawn).
 */
export const CURVE_KINDS = [
	"position",
	"scale",
	"euler",
	"rotation",
	"matrix",
	"opacity",
	"color",
	"order",
] as const
export type CurveKind = (typeof CURVE_KINDS)[number]

export type SpriteTrack = {
	readonly layer: string
	readonly kind: "sprite"
	readonly keys: readonly SpriteKey[]
}

export type CurveTrack = {
	readonly layer: string
	/**
	 * A `CurveKind` for transform bindings, or `attribute<hashed id>` for the
	 * generic bindings the engine hashes out of scripts. Those decode and stay
	 * in the document but are never drawn, so the field is a string rather than
	 * a closed union of the drawable kinds.
	 */
	readonly kind: string
	/** One key list per component (x, y, z). */
	readonly curves: readonly (readonly NumericKey[])[]
}

export type Track = SpriteTrack | CurveTrack

export type LayerConstants = {
	readonly position?: Vec3
	readonly scale?: Vec3
	readonly euler?: Vec3
}

/**
 * Action buckets the picker groups clips into. The exporter labels each clip
 * (`clips[].group`) because the naming convention that implies a bucket belongs
 * to the export, not to the viewer.
 */
export const CLIP_GROUPS = [
	"idle",
	"move",
	"attack",
	"skill",
	"damage",
	"state",
	"other",
] as const
export type ClipGroup = (typeof CLIP_GROUPS)[number]

export type Clip = {
	readonly name: string
	/** Optional recommended whole-clip display reduction; authored tracks stay intact. */
	readonly displayScale?: number
	/** Action bucket; absent on documents exported before the label existed. */
	readonly group?: ClipGroup
	readonly sampleRate: number
	readonly frameCount: number
	readonly durationMs: number
	readonly tracks: readonly Track[]
	readonly constants: Readonly<Record<string, LayerConstants>>
}

export type SoundFrame = {
	readonly frame: number
	readonly events: readonly string[]
	/**
	 * Index-aligned playback gain from the config's `evts` strings
	 * (`event:/…;0.80`). Absent when every gain in the frame is 1.0.
	 */
	readonly volumes?: readonly number[]
}

export type SoundEvent = {
	readonly name: string
	readonly frames: readonly SoundFrame[]
}

/**
 * One of the character's own sound events. Unlike `sounds`, a voice carries no
 * frame: the source data lists them per character (its voice slots), so the
 * viewer offers them as a list to audition rather than scheduling them on a clip.
 */
export type VoiceEvent = {
	readonly name: string
	/** Index in the character's own slot list; display only. */
	readonly slot: number
	readonly event: string
}

export type LayerInfo = {
	readonly name: string
	readonly sortingOrder: number
	readonly sortingLayer: number
	readonly z: number
}

export type AtlasInfo = {
	readonly file: string
	readonly width: number
	readonly height: number
}

export type AudioSummary = {
	readonly events: number
	readonly resolved: number
	readonly unresolved: number
}

export type CharacterStats = {
	readonly sprites: number
	readonly clips: number
	readonly actions?: number
	readonly soundEvents: number
	readonly maxClipMs: number
}

export type ClipOrigin = {
	readonly characterId: string
	readonly clipName: string
}

export type ActionVariant = {
	readonly clip: string
	readonly sources: readonly ClipOrigin[]
	readonly sounds: readonly {
		readonly name: string
		readonly sources: readonly ClipOrigin[]
	}[]
}

export type ModelAction = {
	readonly id: string
	readonly name: string
	readonly group: ClipGroup
	readonly added: boolean
	readonly variants: readonly ActionVariant[]
}

/** What the payload is, independent of which engine produced it. */
export type SourceFormat = {
	readonly container: string
	readonly version: number
}

export type CharacterDocument = {
	readonly schemaVersion: number
	readonly id: string
	readonly name: string | null
	readonly sourceGroup: string
	readonly sourceBundle: string
	/** Provenance of the export; absent on older documents. */
	readonly sourceFormat?: SourceFormat
	readonly atlases: readonly AtlasInfo[]
	readonly sprites: readonly SpriteRecord[]
	readonly clips: readonly Clip[]
	readonly actions?: readonly ModelAction[]
	readonly modelSources?: readonly {
		readonly id: string
		readonly name: string | null
	}[]
	readonly sounds: readonly SoundEvent[]
	/** The character's own sound events; absent on documents exported without them. */
	readonly voices?: readonly VoiceEvent[]
	readonly layers: readonly LayerInfo[]
	readonly audio: AudioSummary
	readonly stats: CharacterStats
}

export type CatalogEntry = {
	readonly id: string
	readonly name: string | null
	/** Folder holding this character, relative to the catalog's directory. */
	readonly directory?: string
	readonly sprites: number
	readonly clips: number
	readonly soundEvents: number
	readonly bytes: number
	readonly hasCover: boolean
}

export type CatalogDocument = {
	readonly schemaVersion: number
	readonly counts: Readonly<Record<string, number>>
	readonly characters: readonly CatalogEntry[]
}

/** What the viewer renders for one layer at one instant. */
export type LayerDraw = {
	readonly layer: string
	readonly sprite: SpriteRecord
	readonly position: Vec2
	readonly scale: Vec2
	readonly rotation: number
	readonly order: number
	readonly matrix?: Affine
	readonly opacity?: number
	readonly color?: Vec3
}

/** A quad placed relative to its own pivot, in stage pixels. */
export type PivotQuad = {
	readonly pivotX: number
	readonly pivotY: number
	readonly left: number
	readonly top: number
	readonly width: number
	readonly height: number
}

export type Playhead = {
	readonly clipName: string
	readonly timeMs: number
	readonly playing: boolean
	readonly speed: number
	readonly loop: boolean
}
