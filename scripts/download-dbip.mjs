// Download the public DB-IP City Lite database used by the container image.
// No secret or token is involved: the database is public data licensed under
// CC BY 4.0.
//
// Usage: DBIP_VERSION=2026-08 node scripts/download-dbip.mjs
//
// Environment:
//   DBIP_VERSION  optional YYYY-MM pin; without it the current month is tried
//                 first and the previous month is used as a fallback.
//   GEOIP_DIR     output directory (default: /geoip).

import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const outputDir = process.env.GEOIP_DIR || '/geoip'
const requested = (process.env.DBIP_VERSION || '').trim()
if (requested && !/^\d{4}-\d{2}$/.test(requested))
  throw new Error(`DBIP_VERSION must look like YYYY-MM, got: ${requested}`)

const toMonth = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
const now = new Date()
const candidates = requested
  ? [requested]
  : [toMonth(now), toMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))]

const attribution = [
  'Contains the DB-IP City Lite database (https://db-ip.com).',
  'DB-IP City Lite is licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).',
  'City Lite provides country, region, city, and coordinates; it does not provide time-zone data.',
  '',
].join('\n')

let lastError
for (const version of candidates) {
  const url = `https://download.db-ip.com/free/dbip-city-lite-${version}.mmdb.gz`
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'slite-image-build' } })
    if (!response.ok)
      throw new Error(`HTTP ${response.status}`)
    const database = gunzipSync(Buffer.from(await response.arrayBuffer()))
    if (database.length < 1024 * 1024)
      throw new Error(`unexpected database size ${database.length} bytes`)
    if (!database.includes(Buffer.from('MaxMind.com')))
      throw new Error('downloaded file is not an MMDB database')
    await mkdir(outputDir, { recursive: true })
    await writeFile(`${outputDir}/dbip-city-lite.mmdb`, database)
    await writeFile(`${outputDir}/ATTRIBUTION.txt`, attribution)
    console.log(`Bundled DB-IP City Lite ${version} (${database.length} bytes).`)
    process.exit(0)
  }
  catch (error) {
    lastError = error
    console.warn(`DB-IP City Lite ${version} unavailable: ${error.message}`)
    if (requested)
      throw error
  }
}
throw new Error(`No DB-IP City Lite download available for: ${candidates.join(', ')} (${lastError?.message})`)
