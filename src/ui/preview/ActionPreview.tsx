import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "../../i18n"
import {
	actionFrameAt,
	clipBoundsFrames,
	clipDisplayScale,
	variantClips,
} from "../../kernel"
import type { Box } from "../../kernel/preview"
import type { CharacterDocument, ModelAction } from "../../kernel/types"
import { PreviewCell } from "./PreviewCell"

export function ActionPreview(props: {
	readonly document: CharacterDocument
	readonly action: ModelAction
	readonly elapsed: number
	readonly resetSignal: number
	readonly reducedSize: boolean
	readonly atlasImages: ReadonlyMap<string, HTMLImageElement>
}) {
	const { t } = useTranslation()
	const [selection, setSelection] = useState<{ index?: number; start: number }>(
		{ start: 0 },
	)
	useEffect(() => {
		setSelection((current) => ({ ...current, start: 0 }))
	}, [props.resetSignal])
	const clips = useMemo(
		() => variantClips(props.document, props.action),
		[props.document, props.action],
	)
	const box = useMemo((): Box | undefined => {
		const boxes = clips.flatMap((clip) => {
			const bounds = clipBoundsFrames(props.document, clip)
			const scale = clipDisplayScale(clip, props.reducedSize)
			return bounds
				? [
						[
							bounds[0] * scale,
							bounds[1] * scale,
							bounds[2] * scale,
							bounds[3] * scale,
						],
					]
				: []
		})
		if (boxes.length === 0) return undefined
		const left = Math.min(...boxes.map((b) => b[0]!))
		const top = Math.min(...boxes.map((b) => b[1]!))
		return [
			left,
			top,
			Math.max(...boxes.map((b) => b[0]! + b[2]!)) - left,
			Math.max(...boxes.map((b) => b[1]! + b[3]!)) - top,
		]
	}, [clips, props.document, props.reducedSize])
	const frame = actionFrameAt(
		clips,
		Math.max(0, props.elapsed - selection.start),
		selection.index,
	)
	if (frame === undefined) return null
	return (
		<PreviewCell
			document={props.document}
			clip={frame.clip}
			timeMs={frame.timeMs}
			atlasImages={props.atlasImages}
			bounds={undefined}
			layoutBounds={box}
			displayScale={clipDisplayScale(frame.clip, props.reducedSize)}
			label={props.action.name}
			controls={
				clips.length > 1 ? (
					<div className="flex items-center gap-2 text-xs">
						<select
							className="max-w-36 rounded border border-border bg-background px-1 py-0.5"
							aria-label={t("variants.chooseAction", {
								name: props.action.name,
							})}
							value={selection.index ?? "cycle"}
							onChange={(event) =>
								setSelection({
									index:
										event.target.value === "cycle"
											? undefined
											: Number(event.target.value),
									start: props.elapsed,
								})
							}
						>
							<option value="cycle">{t("variants.cycle")}</option>
							{clips.map((clip, index) => (
								<option key={clip.name} value={index}>
									{t("variants.number", { index: index + 1 })}
								</option>
							))}
						</select>
						<span
							className="tabular-nums text-muted-foreground"
							data-testid={`variant-counter-${props.action.id}`}
						>
							{frame.index + 1}/{clips.length}
						</span>
					</div>
				) : undefined
			}
		/>
	)
}
