import type { Rect, Vec3 } from "../kernel/types"

const cache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>()
const MAX_ENTRIES = 128

/** Multiply RGB without changing source alpha; cache only a bounded set per atlas. */
export const tintedSprite = (
	image: HTMLImageElement,
	source: Rect,
	color: Vec3,
): HTMLCanvasElement => {
	const key = `${source.join(",")}:${color.join(",")}`
	const entries = cache.get(image) ?? new Map<string, HTMLCanvasElement>()
	cache.set(image, entries)
	const existing = entries.get(key)
	if (existing) return existing
	const canvas = document.createElement("canvas")
	canvas.width = source[2]
	canvas.height = source[3]
	const context = canvas.getContext("2d")
	if (context) {
		context.drawImage(image, ...source, 0, 0, source[2], source[3])
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
		for (let index = 0; index < pixels.data.length; index += 4) {
			for (let channel = 0; channel < 3; channel += 1) {
				pixels.data[index + channel] = Math.round(
					(pixels.data[index + channel] ?? 0) *
						Math.max(0, Math.min(1, color[channel] ?? 1)),
				)
			}
		}
		context.putImageData(pixels, 0, 0)
	}
	if (entries.size >= MAX_ENTRIES) {
		const first = entries.keys().next().value
		if (first !== undefined) entries.delete(first)
	}
	entries.set(key, canvas)
	return canvas
}
