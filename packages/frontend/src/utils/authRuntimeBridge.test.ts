import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerUnauthorizedLogoutHandler,
  handleUnauthorizedLogout,
  registerLogoutRedirectHandler,
  navigateToLoginAfterLogout,
} from './authRuntimeBridge';

describe('authRuntimeBridge', () => {
  beforeEach(() => {
    // 清除所有已注册的处理器
    registerUnauthorizedLogoutHandler(null);
    registerLogoutRedirectHandler(null);
    vi.restoreAllMocks();
  });

  describe('handleUnauthorizedLogout', () => {
    it('应该返回 false 当未注册处理器时', async () => {
      const result = await handleUnauthorizedLogout();
      expect(result).toBe(false);
    });

    it('应该调用已注册的处理器并返回其结果', async () => {
      const handler = vi.fn().mockReturnValue(true);
      registerUnauthorizedLogoutHandler(handler);

      const result = await handleUnauthorizedLogout();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('应该支持异步处理器', async () => {
      const handler = vi.fn().mockResolvedValue(false);
      registerUnauthorizedLogoutHandler(handler);

      const result = await handleUnauthorizedLogout();

      expect(result).toBe(false);
    });

    it('应该支持注销处理器', async () => {
      const handler = vi.fn().mockReturnValue(true);
      registerUnauthorizedLogoutHandler(handler);
      registerUnauthorizedLogoutHandler(null);

      const result = await handleUnauthorizedLogout();
      expect(result).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('navigateToLoginAfterLogout', () => {
    it('应该使用已注册的重定向处理器', async () => {
      const redirectHandler = vi.fn();
      registerLogoutRedirectHandler(redirectHandler);

      await navigateToLoginAfterLogout();

      expect(redirectHandler).toHaveBeenCalledTimes(1);
    });

    it('应该支持异步重定向处理器', async () => {
      const redirectHandler = vi.fn().mockResolvedValue(undefined);
      registerLogoutRedirectHandler(redirectHandler);

      await navigateToLoginAfterLogout();

      expect(redirectHandler).toHaveBeenCalledTimes(1);
    });

    it('应该回退到 window.location.href 当未注册处理器时', async () => {
      const originalHref = window.location.href;
      const assignSpy = vi.fn();

      // 使用 Object.defineProperty 模拟 location.href 赋值
      Object.defineProperty(window, 'location', {
        value: { href: originalHref, assign: assignSpy },
        writable: true,
      });

      await navigateToLoginAfterLogout();

      expect(window.location.href).toBe('/login');
    });

    it('应该支持注销重定向处理器', async () => {
      const redirectHandler = vi.fn();
      registerLogoutRedirectHandler(redirectHandler);
      registerLogoutRedirectHandler(null);

      // 注销后应回退到 location.href
      Object.defineProperty(window, 'location', {
        value: { href: '', assign: vi.fn() },
        writable: true,
      });

      await navigateToLoginAfterLogout();

      expect(redirectHandler).not.toHaveBeenCalled();
      expect(window.location.href).toBe('/login');
    });
  });
});
