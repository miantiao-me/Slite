import type { ImportResult } from '#shared/schemas/import'
import { ImportDataSchema } from '#shared/schemas/import'
import { nanoid } from '#shared/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Import links from exported data',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['version', 'links'],
            properties: {
              version: { type: 'string', description: 'Export format version' },
              exportedAt: { type: 'string', description: 'Export timestamp (ISO 8601)' },
              count: { type: 'integer', description: 'Number of links in export' },
              links: {
                type: 'array',
                description: 'Array of links to import',
                items: {
                  type: 'object',
                  required: ['url', 'slug'],
                  properties: {
                    id: { type: 'string', description: 'Link ID (auto-generated if not provided)' },
                    url: { type: 'string', description: 'The target URL' },
                    slug: { type: 'string', description: 'The slug for the short link' },
                    comment: { type: 'string', description: 'Optional comment' },
                    createdAt: { type: 'integer', description: 'Creation timestamp (unix seconds)' },
                    updatedAt: { type: 'integer', description: 'Last update timestamp (unix seconds)' },
                    expiration: { type: 'integer', description: 'Expiration timestamp (unix seconds)' },
                    title: { type: 'string', description: 'Custom title for link preview' },
                    description: { type: 'string', description: 'Custom description for link preview' },
                    image: { type: 'string', description: 'Custom image for link preview' },
                    apple: { type: 'string', description: 'Apple App Store redirect URL' },
                    google: { type: 'string', description: 'Google Play Store redirect URL' },
                    cloaking: { type: 'boolean', description: 'Enable link cloaking (mask destination URL)' },
                    redirectWithQuery: { type: 'boolean', description: 'Append query parameters to destination URL' },
                    password: { type: 'string', description: 'Password protection for the link' },
                    unsafe: { type: 'boolean', description: 'Mark link as unsafe, showing a warning page before redirect' },
                    geo: { type: 'object', additionalProperties: { type: 'string' }, description: 'Geo redirect rules keyed by ISO 3166-1 alpha-2 country code; round-trip preserved and used for country-based redirects when a GeoIP database is loaded' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Up to 10 normalized link tags, each 1-32 characters' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot import links.',
    })
  }

  const importData = await readValidatedBody(event, ImportDataSchema.parse)
  const { importRequestLimit } = useRuntimeConfig(event)
  if (importData.links.length > importRequestLimit) {
    throw createError({
      status: 400,
      statusText: `Too many links. Maximum ${importRequestLimit} links per request.`,
    })
  }

  const result: ImportResult = {
    success: 0,
    skipped: 0,
    failed: 0,
    successItems: [],
    skippedItems: [],
    failedItems: [],
  }

  const now = Math.floor(Date.now() / 1000)
  for (const [index, linkData] of importData.links.entries()) {
    let slug = linkData.slug
    try {
      slug = normalizeSlug(event, linkData.slug)
      const link = {
        ...linkData,
        id: linkData.id || nanoid(10)(),
        slug,
        createdAt: linkData.createdAt ?? now,
        updatedAt: linkData.updatedAt ?? now,
      }
      if (link.password)
        link.password = await normalizeLinkPasswordForStorage(link.password)
      if (await createLink(event, link)) {
        result.successItems.push({ index, slug, url: linkData.url })
        result.success++
      }
      else {
        result.skippedItems.push({ index, slug, url: linkData.url })
        result.skipped++
      }
    }
    catch (error) {
      result.failed++
      result.failedItems.push({ index, slug, url: linkData.url, reason: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')

  return result
})
