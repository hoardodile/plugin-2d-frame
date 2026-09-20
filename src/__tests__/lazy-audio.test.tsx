import { Effect } from "effect"
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { AudioMap } from "../boundary/documents"
import type { ViewerRuntime } from "../boundary/layer"
import { CharacterView } from "../ui/CharacterView"
import { useAudioMap } from "../ui/useAudioMap"
import { variantFixture } from "./variants.fixture"

const calls = vi.hoisted(() => ({ visual: vi.fn(), audio: vi.fn() }))
vi.mock("../hooks", async () => {
	const { useState } = await import("react")
	const api = {
		resource: { sourceMeta: { files: ["character.json"] } },
		usePref: <T,>(_key: string, initial: T) => useState(initial),
	}
	return { usePluginAPI: () => api }
})
vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("../boundary/audio", () => ({ stopAll: () => Effect.void }))
vi.mock("../boundary/layer", async (original) => ({
	...(await original<typeof import("../boundary/layer")>()),
	makeRuntime: () => ({
		runPromise: Effect.runPromise,
		dispose: async () => {},
	}),
	loadDocument: () => {
		calls.visual()
		return Effect.succeed({ document: variantFixture, atlasImages: new Map() })
	},
	loadAudioMapOptional: (path: string) => calls.audio(path),
}))
vi.mock("../ui/preview/PreviewGrid", () => ({
	PreviewGrid: ({ onMode }: { onMode: (mode: string) => void }) => (
		<button type="button" onClick={() => onMode("inspect")}>
			inspect
		</button>
	),
}))
vi.mock("../ui/inspect/CharacterInspector", () => ({
	CharacterInspector: ({
		runtime,
		directory,
		onMode,
	}: {
		runtime: ViewerRuntime
		directory: string
		onMode: (mode: string) => void
	}) => {
		const map = useAudioMap(runtime, directory)
		const [frame, setFrame] = useState(0)
		return (
			<div data-testid="visual" data-audio={map.length} data-frame={frame}>
				<button type="button" onClick={() => setFrame(7)}>
					seek
				</button>
				<button type="button" onClick={() => onMode("preview")}>
					preview
				</button>
			</div>
		)
	},
}))

afterEach(() => {
	vi.clearAllMocks()
	vi.unstubAllGlobals()
})

it("renders and seeks before optional audio arrives, then reuses both visual and audio loads across views", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	const audio = Promise.withResolvers<AudioMap>()
	calls.audio.mockImplementation(() => Effect.promise(() => audio.promise))
	const container = document.createElement("div")
	document.body.append(container)
	const root = createRoot(container)
	const click = async (text: string) =>
		act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((b) => b.textContent === text)!
				.click()
		})
	try {
		await act(async () => root.render(<CharacterView />))
		expect(calls.visual).toHaveBeenCalledTimes(1)
		expect(calls.audio).not.toHaveBeenCalled()
		await click("inspect")
		await act(async () => {
			await import("../ui/inspect/CharacterInspector")
		})
		const visual = container.querySelector<HTMLElement>(
			'[data-testid="visual"]',
		)!
		expect(visual).not.toBeNull()
		expect(visual.dataset.audio).toBe("0")
		await click("seek")
		await act(async () =>
			audio.resolve([
				{ event: "hit", file: "audio/hit.wav", match: "metadata" },
			]),
		)
		expect(container.querySelector('[data-testid="visual"]')).toBe(visual)
		expect(visual.dataset.frame).toBe("7")
		expect(visual.dataset.audio).toBe("1")
		await click("preview")
		await click("inspect")
		expect(calls.visual).toHaveBeenCalledTimes(1)
		expect(calls.audio).toHaveBeenCalledTimes(1)
	} finally {
		await act(async () => root.unmount())
		container.remove()
	}
})

it("ignores a late audio response for a previous directory", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	const first = Promise.withResolvers<AudioMap>()
	const second = Promise.withResolvers<AudioMap>()
	calls.audio.mockImplementation((path: string) =>
		Effect.promise(() =>
			path.startsWith("a/") ? first.promise : second.promise,
		),
	)
	const { makeRuntime } = await import("../boundary/layer")
	const runtime = makeRuntime({
		readBytes: async () => new ArrayBuffer(0),
		resolveFileUrl: (path) => path,
	})
	function Harness({ directory }: { directory: string }) {
		const map = useAudioMap(runtime, directory)
		return <span>{map[0]?.event ?? "empty"}</span>
	}
	const container = document.createElement("div")
	const root = createRoot(container)
	try {
		await act(async () => root.render(<Harness directory="a/" />))
		await act(async () => root.render(<Harness directory="b/" />))
		await act(async () =>
			second.resolve([{ event: "current", file: null, match: "unresolved" }]),
		)
		await act(async () =>
			first.resolve([{ event: "stale", file: null, match: "unresolved" }]),
		)
		expect(container.textContent).toBe("current")
	} finally {
		await act(async () => root.unmount())
	}
})
