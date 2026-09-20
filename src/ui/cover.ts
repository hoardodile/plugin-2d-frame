import { clipBoxAt, DEFAULT_PIXELS_PER_UNIT } from "../kernel"
import type { CharacterDocument, Clip } from "../kernel/types"
import { paintClipFrame } from "./paint"

/** Capture the selected pose independently of stage size or device density. */
export function captureFrame(props: {
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly timeMs: number
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
	readonly displayScale: number
}): string {
	const pixelsPerUnit = DEFAULT_PIXELS_PER_UNIT * props.displayScale
	const bounds = clipBoxAt(
		props.document,
		props.clip,
		props.timeMs,
		pixelsPerUnit,
	)
	if (!bounds || bounds[2] <= 0 || bounds[3] <= 0) {
		throw new Error("empty-frame")
	}
	const left = Math.floor(bounds[0])
	const top = Math.floor(bounds[1])
	const width = Math.ceil(bounds[0] + bounds[2]) - left
	const height = Math.ceil(bounds[1] + bounds[3]) - top
	if (width * height > 32 * 1024 * 1024) throw new Error("frame-too-large")
	const canvas = document.createElement("canvas")
	if (!canvas.getContext("2d")) throw new Error("canvas-unavailable")
	paintClipFrame(canvas, {
		...props,
		ratio: 1,
		pixelsPerUnit,
		origin: [-left, -top],
		size: [width, height],
	})
	return canvas.toDataURL("image/png")
}
