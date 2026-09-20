import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Button } from "@hoardodile/ui/components/button"
import {
	type CroppedImage,
	ImageCropper,
} from "@hoardodile/ui/components/image-cropper"
import { useCallback, useRef, useState } from "react"
import { usePluginAPI } from "../hooks"
import { useTranslation } from "../i18n"

export function CoverButton({ capture }: { readonly capture: () => string }) {
	const { t } = useTranslation()
	const api = usePluginAPI()
	const [image, setImage] = useState<string>()
	const [error, setError] = useState(false)
	return (
		<>
			<Button
				type="button"
				variant="secondary"
				size="sm"
				onClick={() => {
					setError(false)
					try {
						setImage(capture())
					} catch {
						setError(true)
					}
				}}
				data-testid="frame-cover"
			>
				{t("cover.capture")}
			</Button>
			{error ? <span role="alert">{t("cover.error")}</span> : null}
			{image ? (
				<CoverDialog
					image={image}
					onClose={() => setImage(undefined)}
					upload={async (file) => {
						await api.uploadCover({
							file,
							filename: "cover.png",
							mimeType: "image/png",
						})
					}}
				/>
			) : null}
		</>
	)
}

/** Each capture owns a fresh upload state and an immutable image. */
export function CoverDialog(props: {
	readonly image: string
	readonly onClose: () => void
	readonly upload: (file: Blob) => Promise<void>
}) {
	const { t } = useTranslation()
	const [status, setStatus] = useState<"idle" | "saving" | "error">("idle")
	const renderRef = useRef<() => Promise<CroppedImage>>(async () => {
		throw new Error("crop-not-ready")
	})
	const onCropReady = useCallback((render: () => Promise<CroppedImage>) => {
		renderRef.current = render
	}, [])
	const close = () => {
		if (status !== "saving") props.onClose()
	}
	const confirm = async () => {
		if (status === "saving") return
		setStatus("saving")
		try {
			const cropped = await renderRef.current()
			await props.upload(cropped.blob)
			setStatus("idle")
			props.onClose()
		} catch {
			setStatus("error")
		}
	}
	return (
		<AppDialog
			open
			onOpenChange={(open) => {
				if (!open) close()
			}}
			title={t("cover.capture")}
			description={t("cover.hint")}
			size="lg"
			contentMotion="minimal"
			contentTestId="frame-cover-dialog"
			footer={
				<div className="flex w-full items-center justify-end gap-3">
					{status === "error" ? (
						<span role="alert">{t("cover.error")}</span>
					) : null}
					<Button
						variant="secondary"
						size="sm"
						onClick={close}
						disabled={status === "saving"}
					>
						{t("common.close")}
					</Button>
					<Button
						size="sm"
						onClick={() => void confirm()}
						disabled={status === "saving"}
						data-testid="frame-cover-confirm"
					>
						{t(status === "saving" ? "cover.saving" : "cover.save")}
					</Button>
				</div>
			}
		>
			<ImageCropper
				src={props.image}
				onCropReady={onCropReady}
				displayMaxWidth="100%"
				displayMaxHeight="62vh"
			/>
		</AppDialog>
	)
}
