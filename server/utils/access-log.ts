import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { parseAcceptLanguage } from 'intl-parse-accept-language'
import { UAParser } from 'ua-parser-js'
import {
  CLIs,
  Crawlers,
  Emails,
  ExtraDevices,
  Fetchers,
  InApps,
  MediaPlayers,
  Vehicles,
} from 'ua-parser-js/extensions'
import { parseURL } from 'ufo'
import { runAnalytics } from '../database/analytics'
import { lookupGeo } from '../services/geo'
import { requestClientIp } from './client-ip'

function toBlobNumber(blob: string) {
  return +blob.replace(/\D/g, '')
}

export const blobsMap = {
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
} as const

export const doublesMap = {
  double1: 'latitude',
  double2: 'longitude',
} as const

export type BlobsMap = typeof blobsMap
export type BlobsKey = keyof BlobsMap

export type DoublesMap = typeof doublesMap
export type DoublesKey = keyof DoublesMap

export type LogsKey = BlobsMap[BlobsKey] | DoublesMap[DoublesKey]
export type LogsMap = {
  [key in BlobsMap[BlobsKey]]: string | undefined
} & {
  [key in DoublesMap[DoublesKey]]?: number | undefined
}

export interface WebhookClickContext {
  country: string
  region: string
  city: string
  device: string
  browser: string
  os: string
  referer: string
}

export interface AccessLogResult {
  logs: LogsMap
  click: WebhookClickContext
}

export const logsMap = Object.fromEntries([
  ...Object.entries(blobsMap).map(([k, v]) => [v, k]),
  ...Object.entries(doublesMap).map(([k, v]) => [v, k]),
]) as LogsMap

export function logs2blobs(logs: LogsMap) {
  return (Object.keys(blobsMap) as BlobsKey[])
    .sort((a, b) => toBlobNumber(a) - toBlobNumber(b))
    .map(key => String(logs[blobsMap[key] as LogsKey] || ''))
}

export function collectAccessLog(event: H3Event): AccessLogResult | undefined {
  const ip = requestClientIp(event)

  const { host: referer } = parseURL(getHeader(event, 'referer'))

  const acceptLanguage = getHeader(event, 'accept-language') || ''
  const language = (parseAcceptLanguage(acceptLanguage) || [])[0]

  const userAgent = getHeader(event, 'user-agent') || ''
  const uaInfo = (new UAParser(userAgent, {

    // @ts-expect-error
    browser: [Crawlers.browser || [], CLIs.browser || [], Emails.browser || [], Fetchers.browser || [], InApps.browser || [], MediaPlayers.browser || [], Vehicles.browser || []].flat(),

    // @ts-expect-error
    device: [ExtraDevices.device || []].flat(),
  })).getResult()

  const link = event.context.link || {}

  const isBot = ['crawler', 'fetcher'].includes(uaInfo?.browser?.type || '')
    || ['spider', 'bot'].includes(uaInfo?.browser?.name?.toLowerCase() || '')

  const { disableBotAccessLog } = useRuntimeConfig(event)
  if (isBot && disableBotAccessLog) {
    console.log('bot access log disabled:', userAgent)
    return
  }

  const location = lookupGeo(ip)

  const logs = {
    url: link.url,
    slug: link.slug,
    ua: userAgent,
    ip,
    referer,
    country: location?.country ?? '',
    region: location?.region ?? '',
    city: location?.city ?? '',
    timezone: '',
    language,
    os: uaInfo?.os?.name,
    browser: uaInfo?.browser?.name,
    browserType: uaInfo?.browser?.type,
    device: uaInfo?.device?.model,
    deviceType: uaInfo?.device?.type,
    latitude: location?.latitude ?? undefined,
    longitude: location?.longitude ?? undefined,
  }

  return {
    logs,
    click: {
      country: location?.country ?? '',
      region: location?.region ?? '',
      city: location?.city ?? '',
      device: uaInfo?.device?.type || uaInfo?.device?.model || '',
      browser: uaInfo?.browser?.name || '',
      os: uaInfo?.os?.name || '',
      referer: referer || '',
    },
  }
}

export async function writeAccessLog(event: H3Event, accessLogs: LogsMap): Promise<void> {
  const link = event.context.link || {}
  // Name the columns so the legacy blob16 column keeps its default value.
  const columns = [...Object.keys(blobsMap), ...Object.keys(doublesMap)]
  await runAnalytics(
    `INSERT INTO access_events (event_id, index1, timestamp, ${columns.join(', ')}) VALUES (?, ?, to_timestamp(?), ${columns.map(() => '?').join(', ')})`,
    [randomUUID(), String(link.id || ''), Date.now() / 1000, ...logs2blobs(accessLogs), accessLogs.latitude ?? null, accessLogs.longitude ?? null],
  )
}
