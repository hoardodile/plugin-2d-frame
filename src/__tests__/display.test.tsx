import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"

import { CharacterView } from "../ui/CharacterView"

const fixture = vi.hoisted(() => ({
	schemaVersion: 2,
	id: "test0001",
	name: "Sample",
	sourceGroup: "characters",
	sourceBundle: "synthetic",
	atlases: [],
	sounds: [],
	sprites: [
		{
			name: "part",
			atlas: "atlas.png",
			rect: [0, 0, 100, 100],
			pivot: [0, 0],
			pixelsToUnit: 100,
		},
	],
	layers: [{ name: "body", sortingLayer: 0, sortingOrder: 0, z: 0 }],
	clips: [
		{
			name: "pose",
			sampleRate: 30,
			frameCount: 2,
			durationMs: 2000 / 30,
			displayScale: 0.8,
			constants: {},
			tracks: [
				{ layer: "body", kind: "sprite", keys: [[0, "part"]] },
				{
					layer: "body",
					kind: "matrix",
					curves: [1.25, 0, 0, 1.25, 0, 0].map((v) => [[0, v]]),
				},
			],
		},
	],
	audio: { events: 0, resolved: 0, unresolved: 0 },
	stats: { sprites: 1, clips: 1, soundEvents: 0, maxClipMs: 2000 / 30 },
}))

vi.mock("../hooks", async () => {
	const React = await import("react")
	const api = {
		resource: { sourceMeta: { files: ["character.json"] } },
		usePref: <T,>(_key: string, initial: T) => React.useState(initial),
	}
	return { usePluginAPI: () => api }
})
vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("../boundary/layer", async (original) => {
	const actual = await original<typeof import("../boundary/layer")>()
	const { Effect } = await import("effect")
	return {
		...actual,
		makeRuntime: () => ({
			runPromise: Effect.runPromise,
			dispose: async () => {},
		}),
		loadDocument: () =>
			Effect.succeed({ document: fixture, atlasImages: new Map() }),
	}
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

it("updates preview size immediately from the shared control without reloading the document", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	)
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
	const container = document.createElement("div")
	document.body.append(container)
	const root = createRoot(container)
	try {
		await act(async () => root.render(<CharacterView />))
		const canvas = container.querySelector<HTMLCanvasElement>("canvas")!
		const toggle = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "controls.reducedSize",
		)!
		expect(canvas.style.width).toBe("100px")
		expect(toggle.getAttribute("aria-pressed")).toBe("true")
		await act(async () => toggle.click())
		expect(canvas.style.width).toBe("125px")
		expect(toggle.getAttribute("aria-pressed")).toBe("false")
		await act(async () => toggle.click())
		expect(canvas.style.width).toBe("100px")
		expect(container.querySelector("canvas")).toBe(canvas)
	} finally {
		await act(async () => root.unmount())
		container.remove()
	}
})
