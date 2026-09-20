import { useEffect, useState } from "react"
import type { AudioMap } from "../boundary/documents"
import {
	audioMapPath,
	loadAudioMapOptional,
	type ViewerRuntime,
} from "../boundary/layer"

const EMPTY: AudioMap = []
const requests = new WeakMap<ViewerRuntime, Map<string, Promise<AudioMap>>>()

/** Optional metadata loads independently of the visual document and is reused. */
export function useAudioMap(
	runtime: ViewerRuntime,
	directory: string,
): AudioMap {
	const [loaded, setLoaded] = useState<{
		runtime: ViewerRuntime
		directory: string
		map: AudioMap
	}>()
	useEffect(() => {
		let active = true
		const cache = requests.get(runtime) ?? new Map<string, Promise<AudioMap>>()
		requests.set(runtime, cache)
		let request = cache.get(directory)
		if (!request) {
			request = runtime.runPromise(
				loadAudioMapOptional(audioMapPath(directory)),
			)
			cache.set(directory, request)
		}
		void request.then(
			(map) => {
				if (active) setLoaded({ runtime, directory, map })
			},
			() => {
				cache.delete(directory)
				if (active) setLoaded({ runtime, directory, map: EMPTY })
			},
		)
		return () => {
			active = false
		}
	}, [runtime, directory])
	return loaded?.runtime === runtime && loaded.directory === directory
		? loaded.map
		: EMPTY
}
