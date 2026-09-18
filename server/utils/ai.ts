import type { H3Event } from 'h3'
import { generateText } from '@xsai/generate-text'
import { APICallError } from '@xsai/shared'
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
  const base = {
    apiKey: aiApiKey || undefined,
    baseURL: aiBaseUrl.endsWith('/') ? aiBaseUrl : `${aiBaseUrl}/`,
    model: aiModel,
    messages,
    abortSignal: AbortSignal.timeout(15000),
  }
  // Disable reasoning for low-latency suggestions: each OpenAI-compatible
  // provider uses a different request field, so send them all and let the
  // provider pick the ones it understands. Strict providers that reject
  // unknown fields (e.g. OpenAI) fall back to smaller param sets.
  const attempts: Record<string, unknown>[] = [
    {
      reasoningEffort: 'none', // OpenAI, DeepSeek, GLM 5.2+, Ollama, Gemini, Claude gateways
      thinking: { type: 'disabled' }, // Ark (Doubao), GLM, DeepSeek, Kimi K2.x, Anthropic
      enable_thinking: false, // Alibaba Bailian (Qwen)
      chat_template_kwargs: { enable_thinking: false }, // vLLM/SGLang templates
    },
    { reasoningEffort: 'none' },
    {},
  ]
  let lastError: unknown
  for (const extra of attempts) {
    try {
      const { text } = await generateText({ ...base, ...extra })
      return text ?? ''
    }
    catch (error) {
      lastError = error
      const isArgumentError = error instanceof APICallError
        && (error.statusCode === 400 || error.statusCode === 422)
      if (!isArgumentError)
        throw error
    }
  }
  throw lastError
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
