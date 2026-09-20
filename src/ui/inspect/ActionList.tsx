import { ScrollArea } from "@hoardodile/ui/components/scroll-area"
import { SearchField } from "@hoardodile/ui/components/search-field"
import { SectionLabel } from "@hoardodile/ui/components/section-label"
import { cn } from "@hoardodile/ui/lib/utils"
import { useMemo, useState } from "react"

import { useTranslation } from "../../i18n"
import {
	actionHasDifferences,
	CATEGORY_ORDER,
	clipDuration,
	clipFrameTotal,
	modelActions,
} from "../../kernel"
import type { ClipCategory } from "../../kernel/events"
import type { CharacterDocument } from "../../kernel/types"

export type ActionListProps = {
	readonly document: CharacterDocument
	readonly value: string
	readonly onChange: (name: string) => void
}

/**
 * The action list, as a dense table.
 *
 * One row per action at `h-chip`, carrying everything the viewer knows before a
 * frame is even sampled: length in frames, length in milliseconds and how many
 * sound events the action fires. Search and category chips narrow 75 actions
 * down without scrolling.
 */
export function ActionList({ document, value, onChange }: ActionListProps) {
	const { t } = useTranslation()
	const [query, setQuery] = useState("")
	const [category, setCategory] = useState<ClipCategory | "all">("all")
	const [differencesOnly, setDifferencesOnly] = useState(false)

	const classified = useMemo(
		() =>
			modelActions(document).flatMap((action) => {
				const clip = document.clips.find(
					(c) => c.name === action.variants[0]?.clip,
				)
				return clip === undefined
					? []
					: [{ action, clip, category: action.group }]
			}),
		[document],
	)
	const rows = useMemo(
		() =>
			classified
				.filter(
					(entry) => !differencesOnly || actionHasDifferences(entry.action),
				)
				.filter((entry) => category === "all" || entry.category === category)
				.filter((entry) =>
					query.length === 0
						? true
						: [
								entry.action.name,
								...entry.action.variants.flatMap((v) =>
									v.sources.map((s) => s.clipName),
								),
							].some((name) =>
								name.toLowerCase().includes(query.toLowerCase()),
							),
				)
				.map((entry) => ({
					clip: entry.clip,
					action: entry.action,
					category: entry.category,
					frames: clipFrameTotal(entry.clip),
					durationMs: Math.round(clipDuration(entry.clip)),
					// `sounds[].name` is the clip the events belong to, and one
					// frame entry holds every event that fires on that frame.
					events: document.sounds
						.filter(
							(sound) =>
								sound.name ===
								(entry.action.variants[0]?.sounds[0]?.name ?? entry.clip.name),
						)
						.reduce((total, sound) => total + sound.frames.length, 0),
				})),
		[classified, category, query, document, differencesOnly],
	)

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-col gap-2 px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<SectionLabel>{t("picker.clips")}</SectionLabel>
					<span className="shrink-0 text-muted-foreground text-xs">
						{t("inspect.showing", { count: rows.length })}
					</span>
				</div>
				<SearchField
					value={query}
					onCommit={setQuery}
					placeholder={t("inspect.search")}
				/>
				{document.actions !== undefined ? (
					<label className="flex items-center gap-2 text-xs">
						<input
							type="checkbox"
							checked={differencesOnly}
							onChange={(event) => setDifferencesOnly(event.target.checked)}
						/>
						{t("variants.differencesOnly")}
					</label>
				) : null}
				<div className="flex flex-wrap gap-1">
					<button
						type="button"
						className={cn(
							"h-chip rounded-sm px-2 text-xs",
							category === "all"
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => setCategory("all")}
					>
						{t("inspect.filterAll")}
					</button>
					{CATEGORY_ORDER.filter(
						(group) =>
							classified.filter((entry) => entry.category === group).length > 0,
					).map((group) => (
						<button
							key={group}
							type="button"
							className={cn(
								"h-chip rounded-sm px-2 text-xs",
								category === group
									? "bg-secondary text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setCategory(group)}
						>
							{t(`category.${group}`)}
						</button>
					))}
				</div>
			</div>
			<div className="flex items-center gap-2 px-3 pb-1 text-muted-foreground text-xs">
				<span className="min-w-0 flex-1 truncate">{t("inspect.action")}</span>
				<span className="w-8 shrink-0 text-right">{t("inspect.frames")}</span>
				<span className="w-12 shrink-0 text-right">{t("inspect.ms")}</span>
				<span className="w-6 shrink-0 text-right">{t("inspect.events")}</span>
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-0.5 px-2 pb-3">
					{rows.map((row) => (
						<button
							key={row.action.id}
							type="button"
							aria-pressed={row.action.id === value}
							className={cn(
								"flex h-chip w-full min-w-0 items-center gap-2 rounded-sm px-2 text-left text-xs",
								row.action.id === value
									? "bg-secondary text-foreground"
									: "text-muted-foreground hover:bg-muted hover:text-foreground",
							)}
							onClick={() => onChange(row.action.id)}
						>
							<span className="min-w-0 flex-1 truncate" title={row.action.name}>
								{row.action.name}
								{row.action.variants.length > 1
									? ` · ${row.action.variants.length}`
									: ""}
							</span>
							<span className="w-8 shrink-0 text-right tabular-nums">
								{row.frames}
							</span>
							<span className="w-12 shrink-0 text-right tabular-nums">
								{row.durationMs}
							</span>
							<span className="w-6 shrink-0 text-right tabular-nums">
								{row.events}
							</span>
						</button>
					))}
				</div>
			</ScrollArea>
		</div>
	)
}
