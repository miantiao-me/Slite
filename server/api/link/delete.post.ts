import { DeleteLinkSchema } from '#shared/schemas/link'

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

export default eventHandler(async (event) => {
  assertLinkWritesAllowed(event, 'delete')
  const { slug } = await readValidatedBody(event, DeleteLinkSchema.parse)
  await removeLink(event, slug)

  // Sink responds 200 with an empty body; an undefined handler return would
  // become 204 No Content in the current h3/Nitro stack.
  setResponseStatus(event, 200)
  return send(event, '')
})
