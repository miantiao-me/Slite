// Matches the server default of `importRequestLimit` in nuxt.config.ts.
export const MAX_IMPORT_BATCH_SIZE = 100

function clampBatchSize(value: number): number {
  if (!Number.isFinite(value))
    return 1
  return Math.min(MAX_IMPORT_BATCH_SIZE, Math.max(1, Math.floor(value)))
}

export function toPositiveInteger(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 1
    ? clampBatchSize(parsed)
    : clampBatchSize(fallback)
}

export function resolveImportBatchSize(importBatchLimit: unknown): number {
  return Math.max(1, Math.floor(toPositiveInteger(importBatchLimit) / 2))
}
