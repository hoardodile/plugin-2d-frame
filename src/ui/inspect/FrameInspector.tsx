import { AppDialog } from "@hoardodile/ui/components/app-dialog"
import { Badge } from "@hoardodile/ui/components/badge"
import { Button } from "@hoardodile/ui/components/button"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@hoardodile/ui/components/empty"
import { Icon } from "@hoardodile/ui/components/icon"
import { Label } from "@hoardodile/ui/components/label"
import { ScrollArea } from "@hoardodile/ui/components/scroll-area"
import { SearchField } from "@hoardodile/ui/components/search-field"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { Separator } from "@hoardodile/ui/components/separator"
import { Switch } from "@hoardodile/ui/components/switch"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@hoardodile/ui/components/table"
import { MusicNotes, Play } from "@hoardodile/ui/icons/registry"
import { useState } from "react"

import type { AudioMap } from "../../boundary/documents"
import { useTranslation } from "../../i18n"
import {
	atlasSize,
	clipFrameTotal,
	clipSpriteNames,
	eventsAtFrame,
	frameIndex,
	frameLayers,
	spriteByName,
} from "../../kernel"
import type { CharacterDocument, Clip, VoiceEvent } from "../../kernel/types"

export type FrameInspectorProps = {
	readonly document: CharacterDocument
	readonly clip: Clip
	readonly timeMs: number
	readonly audioMap: AudioMap
	readonly audioEnabled: boolean
	readonly onAudioEnabled: (enabled: boolean) => void
	readonly loop: boolean
	readonly onLoop: (loop: boolean) => void
	/** `true` while the viewer walks the action list instead of looping. */
	readonly autoNext: boolean
	readonly onAutoNext: (autoNext: boolean) => void
	readonly onPlayFile: (file: string, volume: number) => void
}

const formatNumber = (value: number): string =>
	Number.isInteger(value) ? String(value) : value.toFixed(2)

const formatVec = (value: readonly [number, number]): string =>
	`${formatNumber(value[0])}, ${formatNumber(value[1])}`

const formatRounded = (value: number): string =>
	value === 0 ? "0" : value.toFixed(value === Math.round(value) ? 0 : 2)

/**
 * What is actually being drawn, right now.
 *
 * The panel answers three questions about the current playhead in one scroll:
 * which layers are drawn (and where), which sound events fire on this frame,
 * and whether those events resolved to a sample. Empty space was the previous
 * design's only real content; this replaces it with the sampled values.
 */
export function FrameInspector(props: FrameInspectorProps) {
	const { t } = useTranslation()
	const { document, clip, timeMs, audioMap, audioEnabled, onPlayFile } = props
	const [eventMapOpen, setEventMapOpen] = useState(false)
	const [voicesOpen, setVoicesOpen] = useState(false)
	const frame = frameIndex(timeMs, clip.sampleRate, clipFrameTotal(clip))
	const drawn = frameLayers(document, clip, timeMs)
	const extended = document.schemaVersion >= 2
	const due = eventsAtFrame(
		document.sounds.filter((sound) => sound.name === clip.name),
		frame,
	)
	const resolved = audioMap.filter((entry) => entry.file !== null)
	const voices = document.voices ?? []
	const fileFor = (event: string): string | null =>
		audioMap.find((entry) => entry.event === event)?.file ?? null
	const sprites = clipSpriteNames(clip)
	const first = sprites.at(0)
	const record = first === undefined ? undefined : spriteByName(document, first)
	const page = record === undefined ? undefined : atlasSize(record, document)

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/*
			 * The view's switches sit at the top, one per row: they change how
			 * the viewer behaves rather than describing this frame, and the
			 * panel is where the viewer's own settings now live. Auto-next owns
			 * the loop switch it disables — a clip that loops never reaches its
			 * own end, so the two cannot both be on.
			 */}
			<div className="flex shrink-0 flex-col gap-2 px-3 py-2">
				<Label className="flex items-center justify-between gap-2 text-xs">
					{t("controls.loop")}
					<Switch
						size="sm"
						checked={props.loop}
						disabled={props.autoNext}
						onCheckedChange={props.onLoop}
						aria-label={t("controls.loop")}
					/>
				</Label>
				<Label className="flex items-center justify-between gap-2 text-xs">
					{t("controls.autoNext")}
					<Switch
						size="sm"
						checked={props.autoNext}
						onCheckedChange={(checked) => props.onAutoNext(checked)}
						aria-label={t("controls.autoNext")}
					/>
				</Label>
				<Label className="flex items-center justify-between gap-2 text-xs">
					{t("audio.enable")}
					<Switch
						size="sm"
						checked={audioEnabled}
						onCheckedChange={(checked) => props.onAudioEnabled(checked)}
						aria-label={t("audio.enable")}
					/>
				</Label>
			</div>
			<Separator />
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-3 px-3 py-2">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t("inspect.layer")}</TableHead>
								<TableHead>{t("inspect.sprite")}</TableHead>
								<TableHead className="text-right">
									{t("inspect.position")}
								</TableHead>
								<TableHead className="text-right">
									{t("inspect.scaleValue")}
								</TableHead>
								<TableHead className="text-right">{t("inspect.rot")}</TableHead>
								{extended && <TableHead>{t("inspect.matrix")}</TableHead>}
								{extended && <TableHead>{t("inspect.opacity")}</TableHead>}
								{extended && <TableHead>{t("inspect.color")}</TableHead>}
								{extended && <TableHead>{t("inspect.order")}</TableHead>}
							</TableRow>
						</TableHeader>
						<TableBody>
							{drawn.map((layer) => (
								<TableRow key={layer.layer}>
									<TableCell className="truncate text-xs" title={layer.layer}>
										{layer.layer}
									</TableCell>
									<TableCell className="truncate text-xs" title={layer.sprite}>
										{layer.sprite}
									</TableCell>
									<TableCell className="text-right text-xs tabular-nums">
										{formatVec(layer.position)}
									</TableCell>
									<TableCell className="text-right text-xs tabular-nums">
										{formatVec(layer.scale)}
									</TableCell>
									<TableCell className="text-right text-xs tabular-nums">
										{formatRounded(layer.rotation)}
									</TableCell>
									{extended && (
										<TableCell className="text-xs tabular-nums">
											{layer.matrix?.map(formatNumber).join(", ") ?? "—"}
										</TableCell>
									)}
									{extended && (
										<TableCell className="text-xs tabular-nums">
											{formatNumber(layer.opacity ?? 1)}
										</TableCell>
									)}
									{extended && (
										<TableCell className="text-xs tabular-nums">
											{(layer.color ?? [1, 1, 1]).map(formatNumber).join(", ")}
										</TableCell>
									)}
									{extended && (
										<TableCell className="text-xs tabular-nums">
											{formatNumber(layer.order)}
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>

					<div className="flex flex-col gap-1">
						<SectionLabel>{t("inspect.spriteInfo")}</SectionLabel>
						<p className="truncate text-muted-foreground text-xs">
							{t("inspect.spriteLine", {
								count: sprites.length,
								first: first ?? "—",
							})}
						</p>
						<p
							className="truncate text-muted-foreground text-xs"
							title={record?.atlas ?? ""}
						>
							{t("inspect.atlas", {
								file: record?.atlas ?? "—",
								width: page?.[0] ?? 0,
								height: page?.[1] ?? 0,
							})}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							{t("stats.source", { bundle: document.sourceBundle })}
						</p>
					</div>

					<Separator />
					<div className="flex flex-col gap-2">
						<SectionLabel>{t("audio.title")}</SectionLabel>
						<Badge
							variant={resolved.length > 0 ? "secondary" : "outline"}
							className="self-start"
						>
							{t("audio.resolved", {
								resolved: resolved.length,
								total: audioMap.length,
							})}
						</Badge>
					</div>
					{due.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							{t("audio.noneAtFrame")}
						</p>
					) : (
						<div className="flex flex-col gap-1">
							{due.map((entry, index) => {
								const file = fileFor(entry.event)
								return (
									<div
										key={`${entry.sound}-${entry.frame}-${index}`}
										className="flex h-chip items-center gap-2"
									>
										<span
											className="min-w-0 flex-1 truncate text-xs"
											title={entry.event}
										>
											{entry.event}
										</span>
										{entry.volume === 1 ? null : (
											<Badge variant="outline">{`x${entry.volume.toFixed(2)}`}</Badge>
										)}
										<span className="shrink-0 text-muted-foreground text-xs">
											{t("audio.frame", { frame: entry.frame })}
										</span>
										<Button
											size="icon-xs"
											variant="ghost"
											disabled={file === null}
											aria-label={entry.event}
											onClick={() =>
												file === null
													? undefined
													: onPlayFile(file, entry.volume)
											}
										>
											<Icon icon={Play} size="sm" />
										</Button>
									</div>
								)
							})}
						</div>
					)}
					<Button
						size="sm"
						variant="secondary"
						className="w-full justify-between"
						onClick={() => setEventMapOpen(true)}
					>
						<span className="flex min-w-0 items-center gap-2">
							<Icon icon={MusicNotes} size="sm" />
							<span className="truncate">{t("audio.eventMap")}</span>
						</span>
						<Badge variant="outline">{audioMap.length}</Badge>
					</Button>
					{/*
					 * The character's own sound events carry no frame, so they are a
					 * list to audition rather than something the playhead fires.
					 */}
					{voices.length === 0 ? null : (
						<Button
							size="sm"
							variant="secondary"
							className="w-full justify-between"
							onClick={() => setVoicesOpen(true)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<Icon icon={Play} size="sm" />
								<span className="truncate">{t("voices.title")}</span>
							</span>
							<Badge variant="outline">{voices.length}</Badge>
						</Button>
					)}
					<EventMapDialog
						open={eventMapOpen}
						onOpenChange={setEventMapOpen}
						audioMap={audioMap}
						onPlayFile={onPlayFile}
					/>
					<VoiceListDialog
						open={voicesOpen}
						onOpenChange={setVoicesOpen}
						voices={voices}
						fileFor={fileFor}
						onPlayFile={onPlayFile}
					/>
				</div>
			</ScrollArea>
		</div>
	)
}

type EventMapDialogProps = {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly audioMap: AudioMap
	readonly onPlayFile: (file: string, volume: number) => void
}

/**
 * The resolved event→sample map, behind a button.
 *
 * It is reference data rather than something the playhead changes, so it does
 * not belong in the always-visible panel. The scroll area stops above a real
 * footer (Close) instead of running to the dialog's edge, so the last row never
 * hugs the bottom even when the list is long.
 */
function EventMapDialog({
	open,
	onOpenChange,
	audioMap,
	onPlayFile,
}: EventMapDialogProps) {
	const { t } = useTranslation()
	const [query, setQuery] = useState("")
	const resolved = audioMap.filter((entry) => entry.file !== null)
	const rows = audioMap.filter((entry) =>
		query.length === 0
			? true
			: entry.event.toLowerCase().includes(query.toLowerCase()),
	)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			size="md"
			title={t("audio.eventMap")}
			description={t("audio.resolved", {
				resolved: resolved.length,
				total: audioMap.length,
			})}
			contentTestId="event-map-dialog"
			footer={
				<Button
					size="sm"
					variant="secondary"
					onClick={() => onOpenChange(false)}
				>
					{t("common.close")}
				</Button>
			}
		>
			{audioMap.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{t("audio.noMap")}</EmptyTitle>
						<EmptyDescription>{t("audio.noMapHint")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="flex flex-col gap-2">
					<SearchField
						value={query}
						onCommit={setQuery}
						placeholder={t("audio.searchEvents")}
					/>
					<div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
						{rows.map((entry) => (
							<div key={entry.event} className="flex h-chip items-center gap-2">
								<span
									className="min-w-0 flex-1 truncate text-xs"
									title={entry.event}
								>
									{entry.event}
								</span>
								<Badge variant={entry.file === null ? "outline" : "secondary"}>
									{entry.match}
								</Badge>
								<Button
									size="icon-xs"
									variant="ghost"
									disabled={entry.file === null}
									aria-label={entry.event}
									onClick={() =>
										entry.file === null ? undefined : onPlayFile(entry.file, 1)
									}
								>
									<Icon icon={Play} size="sm" />
								</Button>
							</div>
						))}
					</div>
				</div>
			)}
		</AppDialog>
	)
}

type VoiceListDialogProps = {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly voices: readonly VoiceEvent[]
	readonly fileFor: (event: string) => string | null
	readonly onPlayFile: (file: string, volume: number) => void
}

/**
 * The character's own sound events, which no clip schedules.
 *
 * They come from the export as a character-level list: the source says *which*
 * events belong to the character, not which frame of which action plays them, so
 * the panel plays them on demand and never pretends they are frame cues. `slot`
 * is the index in that source list and is shown because it is the only ordering
 * the source has.
 */
function VoiceListDialog({
	open,
	onOpenChange,
	voices,
	fileFor,
	onPlayFile,
}: VoiceListDialogProps) {
	const { t } = useTranslation()
	const resolved = voices.filter((voice) => fileFor(voice.event) !== null)

	return (
		<AppDialog
			open={open}
			onOpenChange={onOpenChange}
			size="md"
			title={t("voices.title")}
			description={t("voices.resolved", {
				resolved: resolved.length,
				total: voices.length,
			})}
			contentTestId="voice-list-dialog"
			footer={
				<Button
					size="sm"
					variant="secondary"
					onClick={() => onOpenChange(false)}
				>
					{t("common.close")}
				</Button>
			}
		>
			<div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
				{voices.map((voice) => {
					const file = fileFor(voice.event)
					return (
						<div
							key={`${voice.slot}-${voice.event}`}
							className="flex h-chip items-center gap-2"
						>
							<span
								className="min-w-0 flex-1 truncate text-xs"
								title={voice.event}
							>
								{voice.name}
							</span>
							<Badge variant="outline">
								{t("voices.slot", { slot: voice.slot })}
							</Badge>
							<Button
								size="icon-xs"
								variant="ghost"
								disabled={file === null}
								aria-label={voice.event}
								onClick={() =>
									file === null ? undefined : onPlayFile(file, 1)
								}
							>
								<Icon icon={Play} size="sm" />
							</Button>
						</div>
					)
				})}
			</div>
		</AppDialog>
	)
}
