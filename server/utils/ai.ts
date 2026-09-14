import type { H3Event } from 'h3'
import { generateText } from '@xsai/generate-text'
import { destr } from 'destr'

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function requireAiConfig(event: H3Event) {
  const config = useRuntimeConfig(event)
  if (!config.aiBaseUrl || !config.aiModel)
    throw createError({ status: 501, statusText: 'AI not enabled' })
  return config
}

export async function generateAiText(event: H3Event, messages: AiMessage[]): Promise<string> {
  const { aiApiKey, aiBaseUrl, aiModel } = requireAiConfig(event)
  const { text } = await generateText({
    apiKey: aiApiKey || undefined,
    baseURL: aiBaseUrl.endsWith('/') ? aiBaseUrl : `${aiBaseUrl}/`,
    model: aiModel,
    messages,
    abortSignal: AbortSignal.timeout(15000),
  })
  return text ?? ''
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim()
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) {
    return trimmed
  }

  const lines = trimmed.split('\n')
  const firstLine = lines[0]?.trim()
  if (lines.length < 2 || (firstLine !== '```' && firstLine !== '```json')) {
    return trimmed
  }

  lines.shift()
  lines.pop()
  return lines.join('\n').trim()
}

export function parseAiResponse(content: string): Record<string, unknown> {
  if (!content.trim())
    return {}

  const parsed = destr(stripCodeFence(content))
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}
