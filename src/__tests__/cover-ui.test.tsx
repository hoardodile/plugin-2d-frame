import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { CoverButton } from "../ui/CoverButton"

const upload = vi.hoisted(() => vi.fn())
vi.mock("../hooks", () => ({ usePluginAPI: () => ({ uploadCover: upload }) }))
vi.mock("../i18n", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("@hoardodile/ui/components/app-dialog", () => ({
	AppDialog: ({
		children,
		footer,
	}: {
		children: ReactNode
		footer: ReactNode
	}) => (
		<div role="dialog">
			{children}
			{footer}
		</div>
	),
}))
vi.mock("@hoardodile/ui/components/image-cropper", () => ({
	ImageCropper: ({
		src,
		onCropReady,
	}: {
		src: string
		onCropReady: (render: () => Promise<unknown>) => void
	}) => {
		onCropReady(async () => ({
			blob: new Blob([src], { type: "image/png" }),
			width: 10,
			height: 10,
			mimeType: "image/png",
		}))
		return <img src={src} alt="capture" />
	},
}))

afterEach(() => {
	vi.unstubAllGlobals()
	vi.clearAllMocks()
})

it("uploads a frozen capture, reopens, and allows retry after an upload failure", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
	const container = document.createElement("div")
	document.body.append(container)
	const root = createRoot(container)
	const capture = vi.fn(() => "data:image/png;base64,YQ==")
	const click = (id: string) =>
		act(async () =>
			container
				.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!
				.click(),
		)
	try {
		upload.mockResolvedValue({ path: "cover.png" })
		await act(async () => root.render(<CoverButton capture={capture} />))
		await click("frame-cover")
		expect(capture).toHaveBeenCalledTimes(1)
		await click("frame-cover-confirm")
		expect(upload).toHaveBeenCalledWith({
			file: expect.any(Blob),
			filename: "cover.png",
			mimeType: "image/png",
		})
		expect(container.querySelector('[role="dialog"]')).toBeNull()
		await click("frame-cover")
		expect(
			container.querySelector<HTMLButtonElement>(
				'[data-testid="frame-cover-confirm"]',
			)!.disabled,
		).toBe(false)
		upload.mockRejectedValueOnce(new Error("offline"))
		await click("frame-cover-confirm")
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"cover.error",
		)
		expect(capture).toHaveBeenCalledTimes(2)
		await click("frame-cover-confirm")
		expect(upload).toHaveBeenCalledTimes(3)
		expect(container.querySelector('[role="dialog"]')).toBeNull()
	} finally {
		await act(async () => root.unmount())
		container.remove()
	}
})
