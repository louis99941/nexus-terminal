/**
 * Metrics Middleware 单元测试
 * 测试 HTTP 请求延迟采集中间件的计时与标签记录
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import { metricsMiddleware } from './metrics.middleware';

// --- Mock 依赖 ---

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 提升时可用
const { mockStartTimer, mockEnd } = vi.hoisted(() => ({
  mockStartTimer: vi.fn(),
  mockEnd: vi.fn(),
}));

vi.mock('./metrics.service', () => ({
  httpRequestDuration: {
    startTimer: mockStartTimer.mockReturnValue(mockEnd),
  },
}));

// 辅助函数：创建 mock Request / Response / NextFunction
function createMockReq(overrides: Partial<Request> = {}) {
  return {
    method: 'GET',
    route: { path: '/api/v1/connections' },
    ...overrides,
  } as unknown as Request;
}

function createMockRes() {
  const listeners: Record<string, Function> = {};
  const res = {
    statusCode: 200,
    on: vi.fn((event: string, cb: Function) => {
      listeners[event] = cb;
    }),
    // 模拟 finish 事件触发
    _triggerFinish() {
      if (listeners['finish']) {
        listeners['finish']();
      }
    },
  } as unknown as Response & { _triggerFinish: () => void };
  return res;
}

describe('MetricsMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('请求链调用', () => {
    it('应该调用 next() 继续请求链', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn() as NextFunction;

      metricsMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('延迟指标记录', () => {
    it('应该在请求完成时记录延迟指标', () => {
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn() as NextFunction;

      metricsMiddleware(req, res, next);
      res._triggerFinish();

      expect(mockEnd).toHaveBeenCalledTimes(1);
      expect(mockEnd).toHaveBeenCalledWith({
        method: 'GET',
        route: '/api/v1/connections',
        status_code: '200',
      });
    });
  });

  describe('路由路径处理', () => {
    it('应该在有路由路径时使用路由路径', () => {
      const req = createMockReq({ route: { path: '/api/v1/ssh-keys' } });
      const res = createMockRes();
      const next = vi.fn() as NextFunction;

      metricsMiddleware(req, res, next);
      res._triggerFinish();

      expect(mockEnd).toHaveBeenCalledWith(expect.objectContaining({ route: '/api/v1/ssh-keys' }));
    });

    it('应该在无路由路径时使用 unmatched_route', () => {
      const req = createMockReq({ route: undefined });
      const res = createMockRes();
      const next = vi.fn() as NextFunction;

      metricsMiddleware(req, res, next);
      res._triggerFinish();

      expect(mockEnd).toHaveBeenCalledWith(expect.objectContaining({ route: 'unmatched_route' }));
    });
  });

  describe('标签记录', () => {
    it('应该正确记录 HTTP 方法和状态码', () => {
      const req = createMockReq({ method: 'POST' });
      const res = createMockRes();
      (res as any).statusCode = 201;
      const next = vi.fn() as NextFunction;

      metricsMiddleware(req, res, next);
      res._triggerFinish();

      expect(mockEnd).toHaveBeenCalledWith({
        method: 'POST',
        route: '/api/v1/connections',
        status_code: '201',
      });
    });
  });
});
