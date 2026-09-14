import { z } from 'zod'
import { SlugSchema } from '#shared/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Delete a short link',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['slug'],
            properties: {
              slug: { type: 'string', description: 'The slug of the link to delete' },
            },
          },
        },
      },
    },
  },
})

const DeleteSchema = z.object({
  slug: SlugSchema.min(1),
})

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot delete links.',
    })
  }

  const body = await readValidatedBody(event, DeleteSchema.parse)
  const slug = normalizeSlug(event, body.slug)
  await deleteLink(event, slug)

  // Sink responds 200 with an empty body; an undefined handler return would
  // become 204 No Content in the current h3/Nitro stack.
  setResponseStatus(event, 200)
  return send(event, '')
})
