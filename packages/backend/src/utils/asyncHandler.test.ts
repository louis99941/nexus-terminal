/**
 * asyncHandler 工具模块单元测试
 * 测试异步路由处理器包装函数的错误捕获与参数传递
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from './asyncHandler';

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {} as Request;
    mockRes = {} as Response;
    mockNext = vi.fn();
  });

  describe('成功执行', () => {
    it('应该正常执行不抛错的异步处理函数', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      // 等待 Promise 微任务完成
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该正常执行同步返回的处理函数', () => {
      const handler = vi.fn().mockReturnValue(undefined);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('应该正确处理 Promise.resolve 的返回值', async () => {
      const handler = vi.fn().mockResolvedValue('some-result');
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('异步错误传递', () => {
    it('应该将异步抛出的错误传递给 next', async () => {
      const error = new Error('异步错误');
      const handler = vi.fn().mockRejectedValue(error);
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      // 等待异步错误被捕获
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('应该将 async 函数中 throw 的错误传递给 next', async () => {
      const error = new Error('async throw 错误');
      const handler = vi.fn().mockImplementation(async () => {
        throw error;
      });
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('应该将延迟 reject 的 Promise 错误传递给 next', async () => {
      const error = new Error('延迟拒绝');
      const handler = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(error), 10);
        });
      });
      const wrapped = asyncHandler(handler);

      wrapped(mockReq as Request, mockRes as Response, mockNext);

      // 等待延迟的 reject 传播
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('同步错误传递', () => {
    it('应该将同步抛出的错误向上传播（未被 Promise.resolve 包裹）', () => {
      const error = new Error('同步错误');
      const handler = vi.fn().mockImplementation(() => {
        throw error;
      });
      const wrapped = asyncHandler(handler);

      // 同步异常在 fn() 调用时抛出，此时 Promise.resolve() 尚未执行
      // 因此错误不会被 .catch(next) 捕获，而是自然向上传播
      expect(() => {
        wrapped(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow('同步错误');

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('参数传递', () => {
    it('应该将 req 参数正确传递给处理函数', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(handler);
      const customReq = { method: 'GET', path: '/test' } as Request;

      wrapped(customReq, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(customReq, mockRes, mockNext);
      expect(handler.mock.calls[0][0]).toBe(customReq);
    });

    it('应该将 res 参数正确传递给处理函数', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(handler);
      const customRes = { status: vi.fn() } as unknown as Response;

      wrapped(mockReq as Request, customRes, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(mockReq, customRes, mockNext);
      expect(handler.mock.calls[0][1]).toBe(customRes);
    });

    it('应该将 next 参数正确传递给处理函数', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(handler);
      const customNext = vi.fn();

      wrapped(mockReq as Request, mockRes as Response, customNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes, customNext);
      expect(handler.mock.calls[0][2]).toBe(customNext);
    });
  });

  describe('返回值', () => {
    it('应该返回一个函数', () => {
      const handler = vi.fn();
      const wrapped = asyncHandler(handler);

      expect(typeof wrapped).toBe('function');
    });

    it('返回的函数应该返回 void', () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrapped = asyncHandler(handler);

      const result = wrapped(mockReq as Request, mockRes as Response, mockNext);

      expect(result).toBeUndefined();
    });
  });
});
