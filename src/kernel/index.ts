/**
 * Pure kernel: frame sampling, atlas math and event scheduling.
 *
 * Nothing in here performs IO, touches the DOM, or holds mutable state — the
 * boundary layer (`src/boundary/**`) decodes documents and hands them over, and
 * the renderer (`src/ui/**`) paints whatever `layersAt` returns.
 */

export * from "./actions"
export * from "./atlas"
export * from "./events"
export * from "./preview"
export * from "./timeline"
export type * from "./types"
