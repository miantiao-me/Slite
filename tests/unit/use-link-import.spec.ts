import type { ImportData, ImportResult } from '../../shared/schemas/import'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLinkImport } from '../../app/composables/useLinkImport'
import { MAX_IMPORT_BATCH_SIZE } from '../../app/utils/import-batch'

const mocks = vi.hoisted(() => ({
  saveAsJson: vi.fn(),
  toastSuccess: vi.fn(),
}))

const originalGlobals = vi.hoisted(() => {
  const useAppConfig = Object.getOwnPropertyDescriptor(globalThis, 'useAppConfig')
  const useRuntimeConfig = Object.getOwnPropertyDescriptor(globalThis, 'useRuntimeConfig')
  const useI18n = Object.getOwnPropertyDescriptor(globalThis, 'useI18n')
  Object.assign(globalThis, {
    useAppConfig: () => ({ slugRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/i }),
    useRuntimeConfig: () => ({ public: { importBatchLimit: '100', slugDefaultLength: '6' } }),
    useI18n: () => ({
      t: (key: string, params?: { count?: number }) => params?.count === undefined
        ? key
        : `${key}:${params.count}`,
    }),
  })
  return { useAppConfig, useRuntimeConfig, useI18n }
})

vi.mock('#shared/schemas/import', async () => import('../../shared/schemas/import'))
vi.mock('#shared/utils/export-file', async () => import('../../shared/utils/export-file'))
vi.mock('@/utils/api', () => ({ useAPI: vi.fn() }))
vi.mock('@/utils/file', () => ({ saveAsJson: mocks.saveAsJson }))
vi.mock('vue-sonner', () => ({ toast: { success: mocks.toastSuccess } }))

beforeEach(() => {
  mocks.saveAsJson.mockReset()
  mocks.toastSuccess.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

afterAll(() => {
  for (const [name, descriptor] of Object.entries(originalGlobals)) {
    if (descriptor)
      Object.defineProperty(globalThis, name, descriptor)
    else
      Reflect.deleteProperty(globalThis, name)
  }
})

function jsonFile(data: unknown, name = 'links.json'): File {
  return {
    name,
    text: async () => JSON.stringify(data),
  } as File
}

function textFile(text: string, name = 'links.json'): File {
  return {
    name,
    text: async () => text,
  } as File
}

function link(index: number) {
  return {
    slug: `import-${index}`,
    url: `https://example.com/${index}`,
  }
}

function result(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    success: 0,
    skipped: 0,
    failed: 0,
    successItems: [],
    skippedItems: [],
    failedItems: [],
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createImport(options: Parameters<typeof useLinkImport>[0] = {}) {
  return useLinkImport({
    batchSize: 2,
    delay: async () => undefined,
    ...options,
  })
}

describe('useLinkImport', () => {
  it('accepts valid JSON and rejects malformed and empty-link JSON', async () => {
    const valid = createImport()
    await valid.handleFile(jsonFile({ version: '1.0', links: [link(0)] }))

    expect(valid.parsedData.value?.links).toHaveLength(1)
    expect(valid.parseError.value).toBeNull()
    expect(valid.isImporting.value).toBe(false)

    const malformed = createImport()
    await malformed.handleFile(textFile('{'))
    expect(malformed.parsedData.value).toBeNull()
    expect(malformed.parseError.value).toBe('migrate.import.errors.parse_error')

    const empty = createImport()
    await empty.handleFile(jsonFile({ version: '1.0', links: [] }))
    expect(empty.parsedData.value).toBeNull()
    expect(empty.parseError.value).toBe('migrate.import.errors.invalid_format')
    expect(empty.validationErrors.value).not.toHaveLength(0)
  })

  it.each([0, 'abc', undefined])('never starts an empty or unbounded batch when importBatchLimit is %s', async (value) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { importBatchLimit: value, slugDefaultLength: '6' } }))
    const requestImport = vi.fn(async (data: ImportData) => result({ success: data.links.length }))
    const state = useLinkImport({ delay: async () => undefined, requestImport })
    await state.handleFile(jsonFile({ version: '1.0', links: [link(0), link(1), link(2)] }))

    await state.importLinks()

    expect(requestImport).toHaveBeenCalledTimes(3)
    for (const [data] of requestImport.mock.calls)
      expect(data.links).toHaveLength(1)
    expect(state.importResult.value?.success).toBe(3)
    expect(state.importProgress.value).toBe(100)
  })

  it.each([101, 2.9, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE])(
    'caps an oversized batchSize option of %s at the server import request limit',
    async (batchSize) => {
      const links = Array.from({ length: 250 }, (_, index) => link(index))
      const requestImport = vi.fn(async (data: ImportData) => result({ success: data.links.length }))
      const state = useLinkImport({ batchSize, delay: async () => undefined, requestImport })
      await state.handleFile(jsonFile({ version: '1.0', links }))

      await state.importLinks()

      expect(requestImport.mock.calls.length).toBeGreaterThan(0)
      for (const [data] of requestImport.mock.calls)
        expect(data.links.length).toBeLessThanOrEqual(MAX_IMPORT_BATCH_SIZE)
      expect(state.importResult.value?.success).toBe(links.length)
      expect(state.importProgress.value).toBe(100)
      expect(Number.isFinite(state.importProgress.value)).toBe(true)
    },
  )

  it('merges batch results with global indexes and completes after a failed batch', async () => {
    let state: ReturnType<typeof createImport>
    const requestImport = vi.fn(async (data: ImportData) => {
      expect(state.isImporting.value).toBe(true)
      if (data.links[0]?.slug === 'import-0') {
        return result({
          success: 1,
          skipped: 1,
          successItems: [{ index: 0, ...link(0) }],
          skippedItems: [{ index: 1, ...link(1) }],
        })
      }
      if (data.links[0]?.slug === 'import-2') {
        expect(state.importProgress.value).toBe(33)
        return result({
          failed: 1,
          failedItems: [{ index: 0, ...link(2), reason: 'invalid' }],
        })
      }
      expect(state.importProgress.value).toBe(67)
      throw new Error('Batch unavailable')
    })
    state = createImport({ requestImport })
    await state.handleFile(jsonFile({
      version: '1.0',
      links: [link(0), link(1), link(2), link(3), link(4)],
    }))

    await state.importLinks()

    expect(requestImport).toHaveBeenCalledTimes(3)
    expect(state.isImporting.value).toBe(false)
    expect(state.importProgress.value).toBe(100)
    expect(state.importResult.value).toEqual({
      success: 1,
      skipped: 1,
      failed: 2,
      successItems: [{ index: 0, ...link(0) }],
      skippedItems: [{ index: 1, ...link(1) }],
      failedItems: [
        { index: 2, ...link(2), reason: 'invalid' },
        { index: 4, ...link(4), reason: 'Batch unavailable' },
      ],
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('migrate.import.result.success_message:1')
  })

  it('ignores reset and a second import while a request is pending', async () => {
    const request = deferred<ImportResult>()
    const requestImport = vi.fn(() => request.promise)
    const state = createImport({ requestImport })
    await state.handleFile(jsonFile({ version: '1.0', links: [link(0)] }))
    const selectedFile = state.selectedFile.value
    const parsedData = state.parsedData.value

    const importing = state.importLinks()
    expect(state.isImporting.value).toBe(true)

    state.reset()
    await state.importLinks()

    expect(requestImport).toHaveBeenCalledTimes(1)
    expect(state.isImporting.value).toBe(true)
    expect(state.selectedFile.value).toBe(selectedFile)
    expect(state.parsedData.value).toBe(parsedData)
    expect(state.importResult.value).toBeNull()
    expect(state.importProgress.value).toBe(0)

    request.resolve(result({ success: 1, successItems: [{ index: 0, ...link(0) }] }))
    await importing
    expect(state.isImporting.value).toBe(false)
    expect(state.importResult.value?.success).toBe(1)
  })

  it('downloads each result category by its global source index', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'))
    const state = createImport({
      requestImport: async data => data.links[0]?.slug === 'import-0'
        ? result({
            success: 1,
            skipped: 1,
            successItems: [{ index: 1, ...link(1) }],
            skippedItems: [{ index: 0, ...link(0) }],
          })
        : result({
            failed: 1,
            failedItems: [{ index: 0, ...link(2), reason: 'invalid link' }],
          }),
    })
    await state.handleFile(jsonFile({ version: '1.0', links: [link(0), link(1), link(2)] }))
    await state.importLinks()
    const sourceLinks = state.parsedData.value!.links

    state.downloadSuccessItems()
    state.downloadSkippedItems()
    state.downloadFailedItems()

    expect(mocks.saveAsJson).toHaveBeenNthCalledWith(1, {
      version: '1.0',
      exportedAt: '2026-01-02T03:04:05.000Z',
      count: 1,
      links: [{ ...sourceLinks[1] }],
    }, 'slite-import-success-2026-01-02T03-04-05-000Z.json')
    expect(mocks.saveAsJson).toHaveBeenNthCalledWith(2, {
      version: '1.0',
      exportedAt: '2026-01-02T03:04:05.000Z',
      count: 1,
      links: [{ ...sourceLinks[0] }],
    }, 'slite-import-skipped-2026-01-02T03-04-05-000Z.json')
    expect(mocks.saveAsJson).toHaveBeenNthCalledWith(3, {
      version: '1.0',
      exportedAt: '2026-01-02T03:04:05.000Z',
      count: 1,
      links: [{ ...sourceLinks[2], _importError: 'invalid link' }],
    }, 'slite-import-failed-2026-01-02T03-04-05-000Z.json')
  })

  it('resets completed workflow state', async () => {
    const state = createImport({
      requestImport: async () => result({ success: 1, successItems: [{ index: 0, ...link(0) }] }),
    })
    await state.handleFile(jsonFile({ version: '1.0', links: [link(0)] }))
    await state.importLinks()

    state.reset()

    expect(state.selectedFile.value).toBeNull()
    expect(state.parsedData.value).toBeNull()
    expect(state.parseError.value).toBeNull()
    expect(state.validationErrors.value).toEqual([])
    expect(state.isImporting.value).toBe(false)
    expect(state.importResult.value).toBeNull()
    expect(state.importProgress.value).toBe(0)
  })
})
