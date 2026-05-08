/**
 * AI Provider 默认配置常量
 * 集中管理 AI 相关的默认值，避免硬编码散落在多处
 */

/** OpenAI API 默认 Base URL */
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Claude API 默认 Base URL */
export const DEFAULT_CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';

/** OpenAI API 端点选项 */
export const OPENAI_ENDPOINT_OPTIONS = [
  { value: '/chat/completions', label: '/chat/completions — Chat Completions 兼容端点' },
  { value: '/responses', label: '/responses — Responses API' },
] as const;

/** AI Provider 默认配置 */
export const AI_PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    model: 'gpt-5-nano',
    endpoint: '/chat/completions' as const,
  },
  claude: {
    baseUrl: DEFAULT_CLAUDE_BASE_URL,
    model: 'claude-haiku-4-5-20251001',
  },
} as const;
