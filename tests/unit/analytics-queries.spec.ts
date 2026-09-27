import type { H3Event } from 'h3'
import type { FilterQuery, Query } from '../../shared/schemas/query'
import { describe, expect, it, vi } from 'vitest'
import {
  buildCountersQuery,
  buildEventsQuery,
  buildHeatmapQuery,
  buildLocationsQuery,
  buildMetricsQuery,
  buildViewsQuery,
} from '../../server/utils/analytics-queries'
import { compileAnalyticsQuery } from '../../server/utils/analytics-sql'

vi.hoisted(() => {
  Object.assign(globalThis, {
    useRuntimeConfig: () => ({ listQueryLimit: '500' }),
  })
})

vi.mock('../../server/database/analytics', () => ({ queryAnalytics: vi.fn() }))

vi.mock('../../server/utils/access-log', async () => {
  const blobsMap = {
    blob1: 'slug',
    blob2: 'url',
    blob3: 'ua',
    blob4: 'ip',
    blob5: 'referer',
    blob6: 'country',
    blob7: 'region',
    blob8: 'city',
    blob9: 'timezone',
    blob10: 'language',
    blob11: 'os',
    blob12: 'browser',
    blob13: 'browserType',
    blob14: 'device',
    blob15: 'deviceType',
  }
  const doublesMap = {
    double1: 'latitude',
    double2: 'longitude',
  }
  return {
    blobsMap,
    doublesMap,
    logsMap: Object.fromEntries([
      ...Object.entries(blobsMap),
      ...Object.entries(doublesMap),
    ].map(([column, name]) => [name, column])),
  }
})

const event = {} as H3Event
const filters: FilterQuery = { slug: 'abc' }

describe('analytics query builders', () => {
  it('compiles counters without a LIMIT clause', () => {
    const compiled = compileAnalyticsQuery(buildCountersQuery(filters, event))

    expect(compiled.sql).toBe('select COUNT(*) as visits, COUNT(DISTINCT blob4) as visitors, COUNT(DISTINCT NULLIF(blob5, ?)) as referers from access_events where blob1 in (?)')
    expect(compiled.parameters).toEqual(['', 'abc'])
  })

  it('compiles views buckets with the client timezone and no LIMIT', () => {
    const compiled = compileAnalyticsQuery(buildViewsQuery({ ...filters, unit: 'hour', clientTimezone: 'Asia/Shanghai' }, event))

    expect(compiled.sql).toContain('strftime(timezone(\'Asia/Shanghai\', timestamp), \'%Y-%m-%d %H\') as time')
    expect(compiled.sql).toContain('group by time')
    expect(compiled.sql).not.toContain('limit')
    expect(compiled.parameters).toEqual(['abc'])
  })

  it('falls back to Etc/UTC for an unknown client timezone', () => {
    const compiled = compileAnalyticsQuery(buildViewsQuery({ unit: 'day', clientTimezone: 'Not/A-Zone' }, event))

    expect(compiled.sql).toContain('\'Etc/UTC\'')
  })

  it('compiles the heatmap without a LIMIT clause', () => {
    const compiled = compileAnalyticsQuery(buildHeatmapQuery({ clientTimezone: 'Etc/UTC' }, event))

    expect(compiled.sql).toContain('group by weekday, hour')
    expect(compiled.sql).not.toContain('limit')
  })

  it('inlines the validated row limit for metrics', () => {
    const query: Query & { type: 'browser' } = { type: 'browser', limit: 25 }
    const compiled = compileAnalyticsQuery(buildMetricsQuery(query, event))

    expect(compiled.sql).toContain('group by name order by count desc limit 25')
    expect(compiled.parameters).toEqual([])
  })

  it('keeps events and locations limits as bound parameters', () => {
    const events = compileAnalyticsQuery(buildEventsQuery({ limit: 25 }, event))
    expect(events.sql).toContain('order by access_events.timestamp desc, event_id desc limit ?')
    expect(events.parameters).toEqual([25])

    const locations = compileAnalyticsQuery(buildLocationsQuery({ limit: 25 }, event))
    expect(locations.sql).toContain('double1 is not null')
    expect(locations.sql).toContain('group by blob8, double1, double2')
    expect(locations.parameters).toEqual([25])
  })

  it('builds filter-only queries without a WHERE clause', () => {
    for (const compiled of [
      compileAnalyticsQuery(buildCountersQuery({}, event)),
      compileAnalyticsQuery(buildViewsQuery({ unit: 'minute', clientTimezone: 'Etc/UTC' }, event)),
      compileAnalyticsQuery(buildHeatmapQuery({ clientTimezone: 'Etc/UTC' }, event)),
    ]) {
      expect(compiled.sql).toContain('from access_events')
      expect(compiled.sql).not.toContain('where')
    }
  })
})
