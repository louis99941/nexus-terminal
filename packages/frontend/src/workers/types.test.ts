/**
 * Worker 消息协议类型定义单元测试
 */
import { describe, it, expect } from 'vitest';
import type { WorkerRequest, WorkerResponse } from './types';

// ==================== WorkerRequest ====================

describe('WorkerRequest 基本结构', () => {
  it('应包含必要字段：id、type 和 payload', () => {
    const request: WorkerRequest = {
      id: 'req-001',
      type: 'process',
      payload: { text: 'hello' },
    };

    expect(request.id).toBe('req-001');
    expect(request.type).toBe('process');
    expect(request.payload).toEqual({ text: 'hello' });
  });

  it('id 应存储字符串类型', () => {
    const request: WorkerRequest = { id: 'some-id', type: 'task', payload: null };
    expect(typeof request.id).toBe('string');
  });

  it('type 应存储字符串类型', () => {
    const request: WorkerRequest = { id: '1', type: 'configure', payload: {} };
    expect(typeof request.type).toBe('string');
  });

  it('payload 应接受对象', () => {
    const request: WorkerRequest = { id: '1', type: 'process', payload: { key: 'value' } };
    expect(request.payload).toEqual({ key: 'value' });
  });

  it('payload 应接受 null', () => {
    const request: WorkerRequest = { id: '1', type: 'process', payload: null };
    expect(request.payload).toBeNull();
  });

  it('payload 应接受数组', () => {
    const request: WorkerRequest = { id: '1', type: 'process', payload: [1, 2, 3] };
    expect(request.payload).toEqual([1, 2, 3]);
  });

  it('payload 应接受字符串', () => {
    const request: WorkerRequest = { id: '1', type: 'process', payload: 'raw text' };
    expect(request.payload).toBe('raw text');
  });

  it('payload 应接受数字', () => {
    const request: WorkerRequest = { id: '1', type: 'count', payload: 42 };
    expect(request.payload).toBe(42);
  });
});

// ==================== WorkerResponse ====================

describe('WorkerResponse 基本结构', () => {
  it('应包含必要字段：id、type 和 payload', () => {
    const response: WorkerResponse = {
      id: 'resp-001',
      type: 'process',
      payload: { result: 'ok' },
    };

    expect(response.id).toBe('resp-001');
    expect(response.type).toBe('process');
    expect(response.payload).toEqual({ result: 'ok' });
  });

  it('error 字段是可选的', () => {
    const responseWithoutError: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: 'result',
    };
    expect(responseWithoutError.error).toBeUndefined();

    const responseWithError: WorkerResponse = {
      id: '2',
      type: 'process',
      payload: null,
      error: 'something went wrong',
    };
    expect(responseWithError.error).toBe('something went wrong');
  });

  it('成功响应的 error 字段应为 undefined', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: { data: 'result' },
    };
    expect(response.error).toBeUndefined();
  });

  it('失败响应的 payload 可以为 null', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: null,
      error: 'Processing failed',
    };
    expect(response.payload).toBeNull();
    expect(response.error).toBeDefined();
  });

  it('响应的 type 应与请求的 type 一致', () => {
    const request: WorkerRequest = { id: '42', type: 'process', payload: {} };
    const response: WorkerResponse = {
      id: request.id,
      type: request.type,
      payload: 'result',
    };
    expect(response.id).toBe(request.id);
    expect(response.type).toBe(request.type);
  });
});

// ==================== 边界情况与健壮性测试 ====================

describe('WorkerRequest 边界情况', () => {
  it('id 应支持 UUID 格式', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const request: WorkerRequest = { id: uuid, type: 'process', payload: {} };
    expect(request.id).toBe(uuid);
    expect(request.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('id 应支持空字符串（接口不强制非空）', () => {
    const request: WorkerRequest = { id: '', type: 'process', payload: {} };
    expect(request.id).toBe('');
  });

  it('type 应支持所有任务类型名称', () => {
    const taskTypes = ['process', 'configure', 'execute', 'terminate'];
    for (const taskType of taskTypes) {
      const request: WorkerRequest = { id: '1', type: taskType, payload: {} };
      expect(request.type).toBe(taskType);
    }
  });

  it('payload 应支持嵌套对象', () => {
    const nested = { level1: { level2: { data: [1, 2, 3] } } };
    const request: WorkerRequest = { id: '1', type: 'process', payload: nested };
    expect(request.payload).toEqual(nested);
  });

  it('payload 应支持 undefined', () => {
    const request: WorkerRequest = { id: '1', type: 'process', payload: undefined };
    expect(request.payload).toBeUndefined();
  });

  it('payload 应支持 boolean', () => {
    const request: WorkerRequest = { id: '1', type: 'configure', payload: true };
    expect(request.payload).toBe(true);
  });
});

describe('WorkerResponse 边界情况', () => {
  it('error 字段应支持空字符串', () => {
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: null,
      error: '',
    };
    expect(response.error).toBe('');
  });

  it('error 字段应支持多行错误消息', () => {
    const multilineError = 'Line 1: TypeError\nLine 2: at function foo\nLine 3: at bar';
    const response: WorkerResponse = {
      id: '1',
      type: 'process',
      payload: null,
      error: multilineError,
    };
    expect(response.error).toBe(multilineError);
    expect(response.error!.split('\n')).toHaveLength(3);
  });

  it('payload 应支持数组结果', () => {
    const results = [{ type: 'json', content: '{}' }, { type: 'text', content: 'hello' }];
    const response: WorkerResponse = { id: '1', type: 'process', payload: results };
    expect(Array.isArray(response.payload)).toBe(true);
    expect((response.payload as typeof results).length).toBe(2);
  });

  it('payload 应支持数字结果', () => {
    const response: WorkerResponse = { id: '1', type: 'count', payload: 42 };
    expect(response.payload).toBe(42);
  });

  it('payload 应支持 boolean 结果', () => {
    const response: WorkerResponse = { id: '1', type: 'configure', payload: { ok: true } };
    expect((response.payload as { ok: boolean }).ok).toBe(true);
  });

  it('同一请求多次响应应通过 id 区分', () => {
    const id1 = 'request-001';
    const id2 = 'request-002';
    const resp1: WorkerResponse = { id: id1, type: 'process', payload: 'result-1' };
    const resp2: WorkerResponse = { id: id2, type: 'process', payload: 'result-2' };

    expect(resp1.id).not.toBe(resp2.id);
    expect(resp1.payload).not.toBe(resp2.payload);
  });
});

// ==================== 请求/响应协议完整性 ====================

describe('Worker 消息协议完整性', () => {
  it('请求 ID 在响应中应保持一致', () => {
    const requestId = 'unique-req-id-xyz';
    const request: WorkerRequest = { id: requestId, type: 'process', payload: 'text' };

    // 模拟 Worker 处理并返回响应
    const response: WorkerResponse = {
      id: request.id,
      type: request.type,
      payload: 'processed result',
    };

    expect(response.id).toBe(request.id);
    expect(response.id).toBe(requestId);
  });

  it('请求的 type 在响应中应匹配', () => {
    const taskType = 'configure';
    const request: WorkerRequest = { id: '1', type: taskType, payload: {} };
    const response: WorkerResponse = { id: '1', type: taskType, payload: { ok: true } };

    expect(response.type).toBe(request.type);
  });

  it('错误响应应包含 error 字段且 payload 可为 null', () => {
    const response: WorkerResponse = {
      id: 'failed-req',
      type: 'process',
      payload: null,
      error: 'Unknown task type: invalid',
    };

    expect(response.error).toContain('Unknown task type');
    expect(response.payload).toBeNull();
  });

  it('成功响应不应包含 error 字段', () => {
    const response: WorkerResponse = {
      id: 'success-req',
      type: 'process',
      payload: { type: 'json', content: '{}' },
    };

    expect('error' in response ? response.error : undefined).toBeUndefined();
  });

  it('WorkerRequest 和 WorkerResponse 共享相同的 id 格式', () => {
    const sharedId = crypto.randomUUID();
    const request: WorkerRequest = { id: sharedId, type: 'process', payload: {} };
    const response: WorkerResponse = { id: sharedId, type: 'process', payload: 'done' };

    expect(request.id).toBe(response.id);
    expect(sharedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
