import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { ActionPreview } from "../ui/preview/ActionPreview"
import { variantFixture } from "./variants.fixture"

vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

it("keeps one canvas and a stable box across variants, supports fixing and restarting", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	)
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
	const container = document.createElement("div")
	document.body.append(container)
	const root = createRoot(container)
	const render = async (elapsed: number, resetSignal = 0) =>
		act(async () =>
			root.render(
				<ActionPreview
					document={variantFixture}
					action={variantFixture.actions![0]!}
					elapsed={elapsed}
					resetSignal={resetSignal}
					reducedSize
					atlasImages={new Map()}
				/>,
			),
		)
	try {
		await render(0)
		const canvas = container.querySelector("canvas")!
		expect(canvas.style.width).toBe("20px")
		await render(1000)
		expect(container.querySelector("canvas")).toBe(canvas)
		expect(container.textContent).toContain("2/2")
		const select = container.querySelector("select")!
		await act(async () => {
			select.value = "0"
			select.dispatchEvent(new Event("change", { bubbles: true }))
		})
		await render(4500)
		expect(container.textContent).toContain("1/2")
		await render(0, 1)
		expect(select.value).toBe("0")
		expect(canvas.style.width).toBe("20px")
		await act(async () => {
			select.value = "cycle"
			select.dispatchEvent(new Event("change", { bubbles: true }))
		})
		await render(1000, 1)
		expect(container.textContent).toContain("2/2")
	} finally {
		await act(async () => root.unmount())
		container.remove()
	}
})
