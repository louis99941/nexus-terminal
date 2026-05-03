import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from './errorExtractor';

describe('extractErrorMessage', () => {
  const fallback = '操作失败，请稍后重试';

  describe('API 错误响应', () => {
    it('应该优先使用 response.data.error（新格式）', () => {
      const err = {
        response: { data: { error: '自定义错误', message: '旧消息' } },
        message: 'Axios 消息',
      };
      expect(extractErrorMessage(err, fallback)).toBe('自定义错误');
    });

    it('应该回退到 response.data.message（旧格式）', () => {
      const err = {
        response: { data: { message: '旧格式消息' } },
        message: 'Axios 消息',
      };
      expect(extractErrorMessage(err, fallback)).toBe('旧格式消息');
    });

    it('应该在 data 为空对象时回退到 Axios message', () => {
      const err = {
        response: { data: {} },
        message: '网络超时',
      };
      expect(extractErrorMessage(err, fallback)).toBe('网络超时');
    });
  });

  describe('AxiosError 回退', () => {
    it('应该使用 err.message 当 response 不存在时', () => {
      const err = { message: 'Network Error' };
      expect(extractErrorMessage(err, fallback)).toBe('Network Error');
    });
  });

  describe('null / undefined 输入', () => {
    it('应该返回后备消息当 err 为 null 时', () => {
      expect(extractErrorMessage(null, fallback)).toBe(fallback);
    });

    it('应该返回后备消息当 err 为 undefined 时', () => {
      expect(extractErrorMessage(undefined, fallback)).toBe(fallback);
    });
  });

  describe('标准 Error 对象', () => {
    it('应该提取 Error.message', () => {
      const err = new Error('标准错误');
      expect(extractErrorMessage(err, fallback)).toBe('标准错误');
    });
  });

  describe('字符串错误', () => {
    it('应该返回后备消息当 err 为普通字符串时', () => {
      expect(extractErrorMessage('raw string error', fallback)).toBe(fallback);
    });
  });

  describe('自定义后备消息', () => {
    it('应该使用自定义后备消息', () => {
      const customFallback = '自定义后备';
      expect(extractErrorMessage(null, customFallback)).toBe(customFallback);
    });
  });
});
