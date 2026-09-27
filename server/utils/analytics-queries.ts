import type { H3Event } from 'h3'
import type { RawBuilder } from 'kysely'
import type { FilterQuery, Query } from '#shared/schemas/query'
import type { BlobsMap, DoublesMap } from './access-log'
import { sql } from 'kysely'
import { z } from 'zod'
import { FilterQuerySchema, QuerySchema } from '#shared/schemas/query'
import { blobsMap, doublesMap, logsMap } from './access-log'
import { createAnalyticsQuery } from './analytics-sql'
import { buildAnalyticsFilter } from './query-filter'
import { getSafeTimezone } from './time'

type MetricType = BlobsMap[keyof BlobsMap] | DoublesMap[keyof DoublesMap]

// Sink accepts every blob and double field; Slite has no Cloudflare-only COLO blob.
const validMetricTypes = [...Object.values(blobsMap), ...Object.values(doublesMap)] as [MetricType, ...MetricType[]]

const viewUnits = { minute: '%Y-%m-%d %H:%M', hour: '%Y-%m-%d %H', day: '%Y-%m-%d' } as const

const ClientTimezoneSchema = z.string()
  .regex(/^[\w+-]+(?:\/[\w+-]+)*$/)
  .max(64)
  .default('Etc/UTC')
  .describe('IANA timezone used to bucket timestamps.')

export const ViewsQuerySchema = FilterQuerySchema.extend({
  unit: z.enum(['minute', 'hour', 'day']).describe('Time bucket size.'),
  clientTimezone: ClientTimezoneSchema,
})

export const MetricsQuerySchema = QuerySchema.extend({
  type: z.enum(validMetricTypes).describe('The access-log dimension to group by.'),
})

export const HeatmapQuerySchema = FilterQuerySchema.extend({
  clientTimezone: ClientTimezoneSchema,
})

export const StatsExportQuerySchema = FilterQuerySchema.refine(
  query => query.startAt === undefined || query.endAt === undefined || query.startAt <= query.endAt,
  { message: 'startAt must be less than or equal to endAt', path: ['startAt'] },
)

export type ViewsQuery = z.infer<typeof ViewsQuerySchema>
export type MetricsQuery = z.infer<typeof MetricsQuerySchema>
export type HeatmapQuery = z.infer<typeof HeatmapQuerySchema>
export type StatsExportQuery = z.infer<typeof StatsExportQuerySchema>

function distinctCount(column: string): RawBuilder<number> {
  return sql<number>`COUNT(DISTINCT ${sql.ref(column)})`
}

function distinctReferers(column: string): RawBuilder<number> {
  return sql<number>`COUNT(DISTINCT NULLIF(${sql.ref(column)}, ${''}))`
}

// The event argument mirrors Sink's signature; Slite's analytics run against a
// fixed DuckDB access_events table instead of a runtime-configured dataset.
function filteredQuery(query: FilterQuery, _event: H3Event) {
  // buildAnalyticsFilter types its argument as the paginated Query for
  // historical reasons; the limit it never reads is filled with a placeholder.
  const filter = buildAnalyticsFilter({ ...query, limit: 0 })
  const analyticsQuery = createAnalyticsQuery()
  return filter ? analyticsQuery.where(filter) : analyticsQuery
}

export function buildCountersQuery(query: FilterQuery, event: H3Event) {
  const statement = filteredQuery(query, event).select([
    sql<number>`COUNT(*)`.as('visits'),
    distinctCount(logsMap.ip!).as('visitors'),
    distinctReferers(logsMap.referer!).as('referers'),
  ])

  return query.id
    ? statement.select(sql.ref('index1').as('id')).groupBy('index1')
    : statement
}

export function buildViewsQuery(query: ViewsQuery, event: H3Event) {
  const timezone = getSafeTimezone(query.clientTimezone)

  return filteredQuery(query, event)
    .select([
      sql<string>`strftime(timezone(${sql.lit(timezone)}, ${sql.ref('timestamp')}), ${sql.lit(viewUnits[query.unit])})`.as('time'),
      sql<number>`COUNT(*)`.as('visits'),
      sql<number>`COUNT(DISTINCT ${sql.ref(logsMap.ip!)})`.as('visitors'),
    ])
    .groupBy('time')
    .orderBy('time')
}

export function buildMetricsQuery(query: MetricsQuery, event: H3Event) {
  const metricColumn = logsMap[query.type] as string

  return filteredQuery(query, event)
    .select([
      sql.ref(metricColumn).as('name'),
      sql<number>`COUNT(*)`.as('count'),
    ])
    .groupBy('name')
    .orderBy('count', 'desc')
    .limit(sql.lit(query.limit))
}

export function buildHeatmapQuery(query: HeatmapQuery, event: H3Event) {
  const timezone = getSafeTimezone(query.clientTimezone)
  const tzTimestamp = sql<string>`timezone(${sql.lit(timezone)}, ${sql.ref('timestamp')})`

  return filteredQuery(query, event)
    .select([
      sql<number>`isodow(${tzTimestamp})`.as('weekday'),
      sql<number>`hour(${tzTimestamp})`.as('hour'),
      sql<number>`COUNT(*)`.as('visits'),
      sql<number>`COUNT(DISTINCT ${sql.ref(logsMap.ip!)})`.as('visitors'),
    ])
    .groupBy(['weekday', 'hour'])
    .orderBy('weekday')
    .orderBy('hour')
}

export function buildAccessExportQuery(query: StatsExportQuery, event: H3Event) {
  return filteredQuery(query, event)
    .select([
      sql.ref(logsMap.slug!).as('slug'),
      sql.ref(logsMap.url!).as('url'),
      distinctCount(logsMap.ip!).as('viewer'),
      sql<number>`COUNT(*)`.as('views'),
      distinctReferers(logsMap.referer!).as('referer'),
    ])
    .groupBy(['slug', 'url'])
    .orderBy('views', 'desc')
}

export function buildEventsQuery(query: Query, event: H3Event) {
  return filteredQuery(query, event)
    .select([
      ...Object.entries(blobsMap).filter(([, name]) => name !== 'ip').map(([column, name]) => sql.ref(column).as(name)),
      sql.ref('double1').as('latitude'),
      sql.ref('double2').as('longitude'),
      sql<string>`CAST(event_id AS VARCHAR)`.as('id'),
      sql<number>`CAST(floor(epoch(timestamp)) AS BIGINT)`.as('timestamp'),
    ])
    .orderBy('access_events.timestamp', 'desc')
    .orderBy('event_id', 'desc')
    .limit(query.limit)
}

export function buildLocationsQuery(query: Query, event: H3Event) {
  return filteredQuery(query, event)
    .where('double1', 'is not', null)
    .where('double2', 'is not', null)
    .select([
      sql.ref('blob8').as(blobsMap.blob8),
      sql.ref('double1').as(doublesMap.double1),
      sql.ref('double2').as(doublesMap.double2),
      sql<number>`COUNT(*)`.as('count'),
    ])
    .groupBy(['blob8', 'double1', 'double2'])
    .orderBy('count', 'desc')
    .limit(query.limit)
}
