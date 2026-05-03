/**
 * AI Provider 默认配置常量
 * 集中管理 AI 相关的默认值，避免硬编码散落在多处
 */

/** OpenAI API 默认 Base URL */
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com';

/** Gemini API 默认 Base URL */
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

/** Claude API 默认 Base URL */
export const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com';

/** AI Provider 默认配置 */
export const AI_PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    model: 'gpt-4o-mini',
    endpoint: 'chat/completions' as const,
  },
  gemini: {
    baseUrl: DEFAULT_GEMINI_BASE_URL,
    model: 'gemini-2.0-flash',
  },
  claude: {
    baseUrl: DEFAULT_CLAUDE_BASE_URL,
    model: 'claude-3-5-haiku-20241022',
  },
} as const;
