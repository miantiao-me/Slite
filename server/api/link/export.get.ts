import type { ExportData, Link } from '#shared/schemas/link'
import { z } from 'zod'

defineRouteMeta({
  openAPI: {
    description: 'Export all links with pagination',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'cursor',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Pagination cursor from previous response',
      },
      {
        name: 'status',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['active', 'expired', 'all'], default: 'all' },
        description: 'Expiration status filter',
      },
    ],
  },
})

const ExportQuerySchema = z.object({
  cursor: z.string().trim().max(1024).optional(),
  status: z.enum(['active', 'expired', 'all']).default('all'),
})

export default eventHandler(async (event) => {
  const { cursor, status } = await getValidatedQuery(event, ExportQuerySchema.parse)
  // Sink-compatible page size; the former NUXT_KV_BATCH_LIMIT config is not restored.
  const limit = 50

  const list = await listLinks(event, { limit, cursor, status, backfillExpiration: true })
  const links: Link[] = []
  for (const link of list.links) {
    if (link) {
      links.push(await protectLinkPasswordForExport(link))
    }
  }

  const exportData: ExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    count: links.length,
    links,
    cursor: list.cursor,
    list_complete: list.list_complete,
  }

  setResponseHeader(event, 'Content-Type', 'application/json')
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return exportData
})
