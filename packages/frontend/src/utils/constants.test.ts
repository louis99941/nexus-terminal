import { describe, it, expect } from 'vitest';
import { GITHUB_REPO_URL } from './constants';

describe('constants', () => {
  describe('GITHUB_REPO_URL', () => {
    it('应该已定义', () => {
      expect(GITHUB_REPO_URL).toBeDefined();
    });

    it('应该是有效的 URL 字符串', () => {
      expect(typeof GITHUB_REPO_URL).toBe('string');
      expect(() => new URL(GITHUB_REPO_URL)).not.toThrow();
    });

    it('应该指向 GitHub 仓库', () => {
      expect(GITHUB_REPO_URL).toMatch(/^https:\/\/github\.com\//);
    });
  });
});
