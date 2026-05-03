import { describe, it, expect } from 'vitest';
import { getTranslation } from './languageUtils';

describe('languageUtils', () => {
  describe('getTranslation', () => {
    describe('中文（zh-CN）', () => {
      it('应该返回一级键的翻译值', () => {
        // appName 是 zh-CN.json 的顶级键
        const result = getTranslation('appName', 'zh-CN');
        expect(result).toBe('星枢终端');
      });

      it('应该支持点号分隔的嵌套键', () => {
        // nav.dashboard 是嵌套键
        const result = getTranslation('nav.dashboard', 'zh-CN');
        expect(result).toBe('仪表盘');
      });

      it('应该默认使用 zh-CN', () => {
        const result = getTranslation('appName');
        expect(result).toBe('星枢终端');
      });
    });

    describe('英文（en-US）', () => {
      it('应该返回英文翻译', () => {
        const result = getTranslation('nav.dashboard', 'en-US');
        expect(result).toBe('Dashboard');
      });
    });

    describe('日文（ja-JP）', () => {
      it('应该返回日文翻译', () => {
        const result = getTranslation('appName', 'ja-JP');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('未找到的键', () => {
      it('应该返回原始键当键不存在时', () => {
        const result = getTranslation('nonexistent.key', 'zh-CN');
        expect(result).toBe('nonexistent.key');
      });

      it('应该回退到 zh-CN 当语言不存在时', () => {
        const result = getTranslation('appName', 'xx-XX');
        expect(result).toBe('星枢终端');
      });
    });
  });
});
