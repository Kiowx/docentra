import type { AIConfig } from '@/types'

export function resolveBaseUrl(config: Pick<AIConfig, 'provider' | 'baseUrl'>): string {
  const trimmedBaseUrl = config.baseUrl?.trim()
  if (trimmedBaseUrl) {
    return trimmedBaseUrl.replace(/\/+$/, '')
  }

  if (config.provider === 'claude') {
    return 'https://api.anthropic.com/v1'
  }

  if (config.provider === 'ollama') {
    return 'http://localhost:11434/v1'
  }

  return 'https://api.openai.com/v1'
}

export function resolveApiKey(config: Pick<AIConfig, 'provider' | 'apiKey'>): string {
  return config.provider === 'ollama' ? 'ollama' : config.apiKey
}
