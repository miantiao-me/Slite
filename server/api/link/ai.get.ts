import type { H3Event } from 'h3'
import type { AiMessage } from '../../utils/ai'
import { z } from 'zod'
import { generateAiText, parseAiResponse, requireAiConfig } from '../../utils/ai'

defineRouteMeta({
  openAPI: {
    description: 'Generate a slug using AI based on the URL',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'url',
        in: 'query',
        required: true,
        schema: { type: 'string', format: 'uri' },
        description: 'The URL to generate a slug for',
      },
    ],
  },
})

function fallbackSlug(event: H3Event, url: string): string {
  let source = 'link'

  try {
    const urlObj = new URL(url)
    const pathSegments = urlObj.pathname.split('/').filter(Boolean)
    source = pathSegments.at(-1) ?? urlObj.hostname
  }
  catch {
    source = 'link'
  }

  const sanitizedSlug = source
    .replace(/[^A-Z0-9-]/gi, '-')
    .slice(0, 50)
    .replace(/^-+|-+$/g, '') || 'link'

  return normalizeSlug(event, sanitizedSlug)
}

export default eventHandler(async (event) => {
  const url = (await getValidatedQuery(event, z.object({
    url: z.url(),
  }).parse)).url
  const { aiPrompt } = requireAiConfig(event)
  const { slugRegex } = useAppConfig()

  const messages: AiMessage[] = [
    { role: 'system', content: aiPrompt.replace('{slugRegex}', slugRegex.toString()) },

    { role: 'user', content: 'https://example.com/' },
    { role: 'assistant', content: '{"slug": "example"}' },

    { role: 'user', content: 'https://github.com/nuxt/' },
    { role: 'assistant', content: '{"slug": "nuxt"}' },

    { role: 'user', content: 'https://example.com/blog/launch-week' },
    { role: 'assistant', content: '{"slug": "launch-week"}' },

    { role: 'user', content: 'https://example.com/docs/getting-started' },
    { role: 'assistant', content: '{"slug": "getting-started"}' },

    { role: 'user', content: url },
  ]

  let response: string
  try {
    response = await generateAiText(event, messages)
  }
  catch (error) {
    console.warn('AI slug generation failed; using fallback.', error)
    return { slug: fallbackSlug(event, url) }
  }

  const result = parseAiResponse(response)
  const slug = String(result.slug ?? '').trim()
  if (!slug) {
    return { slug: fallbackSlug(event, url) }
  }

  return {
    slug: normalizeSlug(event, slug),
  }
})
