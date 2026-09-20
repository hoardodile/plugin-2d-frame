/**
 * Launch the workbench against an exported character collection.
 *
 * The export format is one self-contained folder per character, so
 * `--resource-dir <characters dir>` turns every *direct subfolder* into its own
 * resource. The export itself is not part of this repository: point `--data` at
 * an export root (or at a `characters/` directory). Usage:
 *
 *   node scripts/dev-data.mjs --data <dir>                 # first character
 *   node scripts/dev-data.mjs --data <dir> <id>            # one character
 *   node scripts/dev-data.mjs --data <dir> --all           # every character
 *   node scripts/dev-data.mjs --data <dir> --resource-dir  # hoardodile's own flag
 *   node scripts/dev-data.mjs --data <dir> --collection    # one collection
 *
 * `<dir>` may be an export root (holding `characters/`), a `characters/`
 * directory, or one self-contained character folder; all three are accepted.
 */

import { spawn } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

const args = process.argv.slice(2)
const wantsAll = args.includes("--all")
const wantsCollection = args.includes("--collection")
/** `--resource-dir` is hoardodile's own flag: pass the directory straight on. */
const wantsResourceDir = args.includes("--resource-dir")

const dataIndex = args.indexOf("--data")
const dataValue =
	dataIndex >= 0 ? args[dataIndex + 1] : process.env.FRAME_DATA_ROOT
const ids = args.filter(
	(arg, index) =>
		!arg.startsWith("--") && index !== dataIndex && index !== dataIndex + 1,
)

const usage = [
	"usage: node scripts/dev-data.mjs --data <export dir> [<id>] [--all|--resource-dir|--collection]",
	"",
	"The character export is not part of this repository. Pass the directory that",
	"holds `characters/<id>/character.json` (an export root, or `characters/`",
	"itself), or set FRAME_DATA_ROOT. See docs/format.md.",
].join("\n")

if (dataValue === undefined || dataValue === "") {
	console.error(usage)
	process.exit(1)
}

const dataDir = resolve(dataValue)
if (!existsSync(dataDir)) {
	console.error(`--data directory does not exist: ${dataDir}\n\n${usage}`)
	process.exit(1)
}

/**
 * Three shapes are accepted, because all three are things a user actually has:
 * an export root (holding `characters/`), a `characters/` directory, or one
 * self-contained character folder (`character.json` at its root).
 */
const isCharacterFolder = existsSync(join(dataDir, "character.json"))
const charactersDir = isCharacterFolder
	? dataDir
	: existsSync(join(dataDir, "models", "catalog.json"))
		? join(dataDir, "models")
		: existsSync(join(dataDir, "characters"))
			? join(dataDir, "characters")
			: dataDir
const collectionDir = existsSync(join(charactersDir, "catalog.json"))
	? charactersDir
	: dataDir

if (isCharacterFolder && (wantsAll || wantsCollection)) {
	console.error(
		`${dataDir} is a single character folder — --all/--collection need a directory of characters`,
	)
	process.exit(1)
}

if (!existsSync(join(charactersDir, "catalog.json")) && wantsCollection) {
	console.error(
		`no catalog.json in ${charactersDir} — a collection root needs one`,
	)
	process.exit(1)
}

const characterFolders = isCharacterFolder
	? [dataDir]
	: readdirSync(charactersDir).filter(
			(entry) =>
				existsSync(join(charactersDir, entry, "character.json")) &&
				statSync(join(charactersDir, entry)).isDirectory(),
		)

if (characterFolders.length === 0) {
	console.error(`no character folders in ${charactersDir}`)
	process.exit(1)
}

const cli = join(
	root,
	"node_modules",
	".bin",
	process.platform === "win32" ? "hoardodile.cmd" : "hoardodile",
)

const devArgs = ["plugin", "dev"]
if (wantsCollection) {
	// `characters/catalog.json` is the lean collection root: only character
	// folders plus the catalog, with no sample vault (thousands of files) for
	// the host to crawl on every scan. Serving the whole export root would
	// enumerate all of it.
	devArgs.push("--data", collectionDir)
	console.log(`[dev] collection resource: ${collectionDir}`)
} else if (wantsResourceDir) {
	// `--resource-dir` is hoardodile's own flag: every *direct subfolder* of the
	// characters directory becomes a resource, which is what a player that holds
	// one character per resource wants.
	devArgs.push("--resource-dir", charactersDir)
	console.log(
		`[dev] ${characterFolders.length} character resources in ${charactersDir}`,
	)
} else if (wantsAll) {
	devArgs.push("--resource-dir", charactersDir)
	console.log(
		`[dev] ${characterFolders.length} character resources in ${charactersDir}`,
	)
} else if (isCharacterFolder) {
	// `--data` serves one folder as one resource; `--resource-dir` would treat
	// the character's own `atlas/` subfolder as the resource instead.
	devArgs.push("--data", dataDir)
	console.log(`[dev] character resource: ${basename(dataDir)}`)
} else {
	const chosen = ids.length > 0 ? ids : [basename(characterFolders[0])]
	for (const id of chosen) {
		const folder = join(charactersDir, id)
		if (!existsSync(folder)) {
			console.error(`no such character folder: ${folder}`)
			process.exit(1)
		}
	}
	if (chosen.length > 1) {
		console.error(
			"pass a single id, or --all to serve the whole characters directory",
		)
		process.exit(1)
	}
	devArgs.push("--data", join(charactersDir, chosen[0]))
	console.log(`[dev] character resource: ${chosen[0]}`)
}

const child = spawn(cli, devArgs, {
	stdio: "inherit",
	shell: process.platform === "win32",
})
child.on("exit", (code) => process.exit(code ?? 0))
