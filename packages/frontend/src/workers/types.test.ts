/**
 * Worker 消息协议类型 (types.ts) 结构验证测试
 *
 * 由于 types.ts 仅包含 TypeScript 类型定义，
 * 这些测试通过构造符合接口的对象并验证其结构来确认协议契约。
 */
import { describe, it, expect } from 'vitest';
import type { WorkerRequest, WorkerResponse } from './types';

describe('WorkerRequest 接口', () => {
  it('应该包含 id、type 和 payload 字段', () => {
    const request: WorkerRequest = {
      id: 'test-id-123',
      type: 'process',
      payload: { text: 'hello' },
    };
    expect(request.id).toBe('test-id-123');
    expect(request.type).toBe('process');
    expect(request.payload).toEqual({ text: 'hello' });
  });

  it('payload 应支持任意类型', () => {
    const requestWithString: WorkerRequest = {
      id: '1',
      type: 'test',
      payload: 'string payload',
    };
    const requestWithNumber: WorkerRequest = {
      id: '2',
      type: 'test',
      payload: 42,
    };
    const requestWithNull: WorkerRequest = {
      id: '3',
      type: 'test',
      payload: null,
    };
    const requestWithArray: WorkerRequest = {
      id: '4',
      type: 'test',
      payload: [1, 2, 3],
    };

    expect(requestWithString.payload).toBe('string payload');
    expect(requestWithNumber.payload).toBe(42);
    expect(requestWithNull.payload).toBeNull();
    expect(requestWithArray.payload).toEqual([1, 2, 3]);
  });

  it('id 应为字符串', () => {
    const request: WorkerRequest = { id: 'uuid-test', type: 'run', payload: {} };
    expect(typeof request.id).toBe('string');
  });

  it('type 应为字符串', () => {
    const request: WorkerRequest = { id: '1', type: 'configure', payload: {} };
    expect(typeof request.type).toBe('string');
  });
});

describe('WorkerResponse 接口', () => {
  it('应该包含 id、type 和 payload 字段', () => {
    const response: WorkerResponse = {
      id: 'resp-id-456',
      type: 'process',
      payload: { result: 'done' },
    };
    expect(response.id).toBe('resp-id-456');
    expect(response.type).toBe('process');
    expect(response.payload).toEqual({ result: 'done' });
  });

  it('error 字段应为可选', () => {
    const successResponse: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: 'success',
    };
    // error is undefined when not provided
    expect(successResponse.error).toBeUndefined();
  });

  it('error 字段存在时应为字符串', () => {
    const errorResponse: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: null,
      error: 'Something went wrong',
    };
    expect(errorResponse.error).toBe('Something went wrong');
    expect(typeof errorResponse.error).toBe('string');
  });

  it('payload 应支持 null（错误响应场景）', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: null,
      error: 'Task failed',
    };
    expect(response.payload).toBeNull();
    expect(response.error).toBe('Task failed');
  });

  it('成功响应中 id 应与请求 id 对应', () => {
    const requestId = 'matching-id';
    const request: WorkerRequest = { id: requestId, type: 'test', payload: {} };
    const response: WorkerResponse = { id: requestId, type: 'test', payload: 'done' };

    expect(response.id).toBe(request.id);
  });

  it('type 应与请求 type 对应', () => {
    const request: WorkerRequest = { id: '1', type: 'process', payload: {} };
    const response: WorkerResponse = { id: '1', type: 'process', payload: {} };

    expect(response.type).toBe(request.type);
  });

  it('payload 应支持嵌套对象', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: { nested: { level: 2, data: [1, 2, 3] } },
    };
    expect((response.payload as { nested: { level: number } }).nested.level).toBe(2);
  });

  it('payload 应支持布尔值', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'configure',
      payload: true,
    };
    expect(response.payload).toBe(true);
  });
});

describe('WorkerRequest / WorkerResponse 协议一致性', () => {
  it('response id 应与 request id 一一对应', () => {
    const ids = ['req-1', 'req-2', 'req-3'];
    ids.forEach((id) => {
      const request: WorkerRequest = { id, type: 'process', payload: {} };
      const response: WorkerResponse = { id, type: 'process', payload: 'done' };
      expect(response.id).toBe(request.id);
    });
  });

  it('WorkerRequest payload 应支持布尔类型', () => {
    const request: WorkerRequest = { id: '1', type: 'configure', payload: true };
    expect(request.payload).toBe(true);
  });

  it('WorkerRequest payload 应支持嵌套对象', () => {
    const request: WorkerRequest = {
      id: '1',
      type: 'process',
      payload: { text: 'hello', options: { highlight: true, threshold: 500 } },
    };
    expect((request.payload as { text: string }).text).toBe('hello');
  });

  it('WorkerResponse 不含 error 时 error 应为 undefined', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: { result: 'ok' },
    };
    expect('error' in response ? response.error : undefined).toBeUndefined();
  });
});
