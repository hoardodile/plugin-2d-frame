import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { loadImage, makeResourceAccess } from "../boundary/resource"
import { tintedSprite } from "../ui/tint"

afterEach(() => vi.restoreAllMocks())

describe("sprite color multiplication", () => {
	it("multiplies RGB, preserves alpha and reuses the same atlas crop", () => {
		const pixels = { data: new Uint8ClampedArray([200, 100, 60, 128]) }
		const putImageData = vi.fn()
		const context = {
			drawImage: vi.fn(),
			getImageData: () => pixels,
			putImageData,
		}
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
			context as unknown as CanvasRenderingContext2D,
		)
		const image = new Image()
		const first = tintedSprite(image, [0, 0, 1, 1], [0.5, 1, 0])
		expect([...pixels.data]).toEqual([100, 100, 0, 128])
		expect(tintedSprite(image, [0, 0, 1, 1], [0.5, 1, 0])).toBe(first)
		expect(putImageData).toHaveBeenCalledTimes(1)
	})
	it("requests an origin-clean atlas before assigning its URL", async () => {
		const order: string[] = []
		const originalImage = globalThis.Image
		class TestImage {
			onload?: () => void
			set crossOrigin(value: string) {
				order.push(`cors:${value}`)
			}
			set src(value: string) {
				order.push(`src:${value}`)
				this.onload?.()
			}
		}
		vi.stubGlobal("Image", TestImage)
		try {
			await Effect.runPromise(
				loadImage("atlas.png").pipe(
					Effect.provide(
						makeResourceAccess({
							readBytes: async () => new ArrayBuffer(0),
							resolveFileUrl: () => "http://localhost/atlas.png",
						}),
					),
				),
			)
			expect(order).toEqual([
				"cors:anonymous",
				"src:http://localhost/atlas.png",
			])
		} finally {
			vi.stubGlobal("Image", originalImage)
		}
	})
})
