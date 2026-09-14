import { describe, expect, it } from 'vitest'
import { MAX_IMPORT_BATCH_SIZE, resolveImportBatchSize, toPositiveInteger } from '../../app/utils/import-batch'

describe('toPositiveInteger', () => {
  it.each([
    [1, 1],
    [50, 50],
    ['1', 1],
    ['42', 42],
    [0, 1],
    ['0', 1],
    [-5, 1],
    ['-5', 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NEGATIVE_INFINITY, 1],
    ['', 1],
    ['   ', 1],
    [null, 1],
    [undefined, 1],
    [{}, 1],
    [[], 1],
    [true, 1],
  ])('parses %s as %s', (value, expected) => {
    expect(toPositiveInteger(value)).toBe(expected)
  })

  it.each([
    [2.9, 2],
    ['3.7', 3],
    [1.9, 1],
    [0.9, 1],
  ])('floors positive decimal %s to %s', (value, expected) => {
    expect(toPositiveInteger(value)).toBe(expected)
  })

  it('uses the provided fallback for invalid values', () => {
    expect(toPositiveInteger('abc', 25)).toBe(25)
    expect(toPositiveInteger(0, 25)).toBe(25)
    expect(toPositiveInteger(undefined, 7)).toBe(7)
  })

  it.each([
    [100, 100],
    [101, 100],
    ['100', 100],
    ['101', 100],
    ['1e2', 100],
    [1e21, 100],
    [1e308, 100],
    [Number.MAX_SAFE_INTEGER, 100],
    [Number.MAX_VALUE, 100],
  ])('clamps large value %s to the maximum batch size', (value, expected) => {
    expect(toPositiveInteger(value)).toBe(expected)
  })

  it.each([
    [0, 1],
    [-10, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [101, 100],
    [MAX_IMPORT_BATCH_SIZE, 100],
    [999, 100],
  ])('clamps fallback %s into 1..MAX_IMPORT_BATCH_SIZE', (fallback, expected) => {
    expect(toPositiveInteger('abc', fallback)).toBe(expected)
  })

  it('always returns a safe integer within 1..MAX_IMPORT_BATCH_SIZE', () => {
    const inputs = [
      0,
      1,
      100,
      101,
      2.9,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_VALUE,
      '1e21',
      '1e400',
      'abc',
      '',
      undefined,
      null,
    ]

    for (const value of inputs) {
      const result = toPositiveInteger(value)
      expect(Number.isSafeInteger(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(MAX_IMPORT_BATCH_SIZE)
    }
  })
})

describe('resolveImportBatchSize', () => {
  it.each([
    [50, 25],
    ['50', 25],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 2],
    [25, 12],
  ])('resolves %s to half the limit with a minimum of 1, got %s', (value, expected) => {
    expect(resolveImportBatchSize(value)).toBe(expected)
  })

  it.each([
    0,
    '0',
    -10,
    'abc',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '',
    null,
    undefined,
    {},
  ])('falls back to 1 for invalid limit %s', (value) => {
    expect(resolveImportBatchSize(value)).toBe(1)
  })

  it.each([
    [100, 50],
    [101, 50],
    ['1e21', 50],
    [1e308, 50],
    [Number.MAX_SAFE_INTEGER, 50],
    [Number.MAX_VALUE, 50],
  ])('caps %s at half the maximum batch size', (value, expected) => {
    expect(resolveImportBatchSize(value)).toBe(expected)
  })

  it('never resolves above the maximum batch size and stays finite', () => {
    for (const value of [101, 1e21, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Number.POSITIVE_INFINITY]) {
      const result = resolveImportBatchSize(value)
      expect(Number.isSafeInteger(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(MAX_IMPORT_BATCH_SIZE)
    }
  })
})
