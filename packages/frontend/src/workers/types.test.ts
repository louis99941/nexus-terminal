



















































































































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