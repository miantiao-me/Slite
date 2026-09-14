import type { Query } from '../../shared/schemas/query'
import { sql } from 'kysely'
import { describe, expect, it, vi } from 'vitest'
import { compileAnalyticsQuery, createAnalyticsQuery } from '../../server/utils/analytics-sql'
import { buildAnalyticsFilter } from '../../server/utils/query-filter'

vi.mock('../../server/database/analytics', () => ({ queryAnalytics: vi.fn() }))
vi.mock('../../server/utils/access-log', () => ({
  blobsMap: { blob1: 'slug', blob2: 'url', blob4: 'ip', blob5: 'referer', blob6: 'country' },
}))

const baseQuery: Query = { limit: 500 }

describe('duckDB analytics SQL compiler', () => {
  it('uses the local event table and exact counts', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().select(sql<number>`COUNT(*)`.as('visits')))
    expect(compiled.sql).toBe('select COUNT(*) as visits from access_events')
    expect(compiled.parameters).toEqual([])
  })

  it('keeps user values in bound parameters', () => {
    const payload = String.raw`it's \'; DROP TABLE access_events; --`
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where('index1', '=', payload))
    expect(compiled.sql).toBe('select * from access_events where index1 = ?')
    expect(compiled.sql).not.toContain(payload)
    expect(compiled.parameters).toEqual([payload])
  })

  it('binds pagination and preserves stable ordering', () => {
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().orderBy('timestamp', 'desc').orderBy('event_id', 'desc').limit(10))
    expect(compiled.sql).toContain('order by timestamp desc, event_id desc limit ?')
    expect(compiled.parameters).toEqual([10])
  })

  it.each(['invalid-column', 'column;drop', '`column`'])('rejects invalid column %s', (column) => {
    expect(() => compileAnalyticsQuery(createAnalyticsQuery().select(sql.ref(column).as('value')))).toThrow('Invalid Analytics identifier')
  })

  it('rejects invalid result aliases', () => {
    expect(() => compileAnalyticsQuery(createAnalyticsQuery().select(sql.ref('blob1').as('invalid-alias')))).toThrow('Invalid Analytics identifier')
  })
})

describe('analytics filters', () => {
  it('omits an empty filter', () => {
    expect(buildAnalyticsFilter(baseQuery)).toBeUndefined()
  })

  it('combines ordinary, time, and IN-list filters with parameters', () => {
    const filter = buildAnalyticsFilter({ ...baseQuery, id: 'first,second', slug: 'alpha,beta', country: 'US', startAt: 100.9, endAt: 200.9 })
    const compiled = compileAnalyticsQuery(createAnalyticsQuery().selectAll().where(filter!))
    expect(compiled.sql).toContain('index1 in (?, ?)')
    expect(compiled.sql).toContain('blob1 in (?, ?)')
    expect(compiled.sql).toContain('blob6 in (?)')
    expect(compiled.sql).toContain('timestamp >= to_timestamp(?)')
    expect(compiled.sql).toContain('timestamp <= to_timestamp(?)')
    expect(compiled.parameters).toEqual(['first', 'second', 'alpha', 'beta', 'US', 100, 200])
  })

  it('rejects control characters in query filters', () => {
    expect(() => buildAnalyticsFilter({ ...baseQuery, slug: 'safe\nunsafe' })).toThrow('Analytics filters must not contain control characters')
    expect(() => buildAnalyticsFilter({ ...baseQuery, id: 'safe\u007Funsafe' })).toThrow('Analytics filters must not contain control characters')
  })
})
