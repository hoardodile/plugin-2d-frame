import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type { DueEvent } from "../kernel"
import { usePlayback } from "../ui/usePlayback"
import { variantFixture } from "./variants.fixture"

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

it("schedules the selected sound version and fires its first frame once after switching", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	let now = 0
	let nextId = 0
	const callbacks = new Map<number, FrameRequestCallback>()
	vi.spyOn(performance, "now").mockImplementation(() => now)
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
		nextId += 1
		callbacks.set(nextId, callback)
		return nextId
	})
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
		callbacks.delete(id)
	})
	const due = vi.fn<(event: DueEvent) => void>()
	function Player({ soundName }: { soundName: string }) {
		const playback = usePlayback({
			document: variantFixture,
			clip: variantFixture.clips[0]!,
			soundName,
			emit: due,
		})
		return (
			<button type="button" onClick={playback.toggle}>
				{playback.playing ? "pause" : "play"}
			</button>
		)
	}
	const container = document.createElement("div")
	const root = createRoot(container)
	const tick = async () =>
		act(async () => {
			now += 16
			const scheduled = [...callbacks.values()]
			callbacks.clear()
			for (const callback of scheduled) callback(now)
		})
	try {
		await act(async () => root.render(<Player soundName="a-quiet" />))
		await tick()
		expect(due).not.toHaveBeenCalled()
		await act(async () => root.render(<Player soundName="a-loud" />))
		await tick()
		await tick()
		expect(due).toHaveBeenCalledTimes(1)
		expect(due.mock.calls[0]?.[0]).toMatchObject({
			event: "hit",
			sound: "a-loud",
			frame: 0,
		})
		await act(async () => container.querySelector("button")!.click())
		await tick()
		await act(async () => container.querySelector("button")!.click())
		await tick()
		expect(due).toHaveBeenCalledTimes(1)
	} finally {
		await act(async () => root.unmount())
	}
})
