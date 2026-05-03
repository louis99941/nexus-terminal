import { describe, it, expect } from 'vitest';
import { DEFAULT_OPENAI_BASE_URL, AI_PROVIDER_DEFAULTS } from './aiConstants';

describe('aiConstants', () => {
  describe('DEFAULT_OPENAI_BASE_URL', () => {
    it('应该已定义', () => {
      expect(DEFAULT_OPENAI_BASE_URL).toBeDefined();
    });

    it('应该是有效的 URL 字符串', () => {
      expect(typeof DEFAULT_OPENAI_BASE_URL).toBe('string');
      expect(() => new URL(DEFAULT_OPENAI_BASE_URL)).not.toThrow();
    });

    it('应该指向 OpenAI API', () => {
      expect(DEFAULT_OPENAI_BASE_URL).toContain('openai.com');
    });
  });

  describe('AI_PROVIDER_DEFAULTS', () => {
    it('应该已定义', () => {
      expect(AI_PROVIDER_DEFAULTS).toBeDefined();
    });

    it('应该包含 openai 提供者配置', () => {
      expect(AI_PROVIDER_DEFAULTS.openai).toBeDefined();
    });

    describe('openai 默认配置', () => {
      it('应该包含有效的 baseUrl', () => {
        expect(AI_PROVIDER_DEFAULTS.openai.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);
      });

      it('应该包含 model 字段', () => {
        expect(typeof AI_PROVIDER_DEFAULTS.openai.model).toBe('string');
        expect(AI_PROVIDER_DEFAULTS.openai.model.length).toBeGreaterThan(0);
      });

      it('应该包含 endpoint 字段', () => {
        expect(typeof AI_PROVIDER_DEFAULTS.openai.endpoint).toBe('string');
        expect(AI_PROVIDER_DEFAULTS.openai.endpoint).toContain('completions');
      });
    });
  });
});
