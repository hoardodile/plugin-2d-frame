import { Schema } from "effect"
import { expect, it } from "vitest"
import { CharacterDocumentSchema } from "../boundary/schema"
import {
	actionFrameAt,
	actionHasDifferences,
	modelActions,
	variantClips,
} from "../kernel/actions"
import { variantFixture } from "./variants.fixture"

it("cycles at exact boundaries with unequal durations and keeps fixed variants", () => {
	const clips = variantClips(variantFixture, variantFixture.actions![0]!)
	for (const [time, index, local] of [
		[0, 0, 0],
		[999, 0, 999],
		[1000, 1, 0],
		[2999, 1, 1999],
		[3000, 0, 0],
		[10000, 1, 0],
	]) {
		expect(actionFrameAt(clips, time!)).toMatchObject({ index, timeMs: local })
	}
	expect(actionFrameAt(clips, 3500, 1)).toMatchObject({
		index: 1,
		timeMs: 1500,
	})
	expect(actionFrameAt([], 100)).toBeUndefined()
})

it("legacy clips remain individual actions without name heuristics", () => {
	const { actions: _, ...legacy } = variantFixture
	expect(modelActions(legacy).map((a) => a.id)).toEqual(["idle", "a", "b"])
	expect(modelActions(legacy).every((a) => a.variants.length === 1)).toBe(true)
	expect(actionHasDifferences(variantFixture.actions![0]!)).toBe(true)
	expect(actionHasDifferences(variantFixture.actions![1]!)).toBe(false)
})

it("preserves action metadata and rejects incomplete references", () => {
	const decode = Schema.decodeUnknownSync(CharacterDocumentSchema)
	expect(decode(variantFixture).actions).toEqual(variantFixture.actions)
	for (const kind of ["clip", "sound", "source", "empty", "duplicate"]) {
		const doc = structuredClone(variantFixture)
		const actions = doc.actions!.map((a) => ({
			...a,
			variants: a.variants.map((v) => ({
				...v,
				sources: [...v.sources],
				sounds: [...v.sounds],
			})),
		}))
		const variant = actions[0]!.variants[0]!
		if (kind === "clip") variant.clip = "missing"
		if (kind === "sound")
			variant.sounds = [{ name: "missing", sources: variant.sources }]
		if (kind === "source")
			variant.sources = [{ characterId: "missing", clipName: "a" }]
		if (kind === "empty") actions[0]!.variants = []
		if (kind === "duplicate") actions.push(actions[0]!)
		expect(() => decode({ ...doc, actions })).toThrow()
	}
})
