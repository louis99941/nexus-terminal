/**
 * 批量任务优先级调度器
 * 使用最小堆实现，优先级高的任务先执行
 */
import { BatchTask, BatchTaskPriority } from './batch.types';
import { logger } from '../utils/logger';

const PRIORITY_WEIGHT: Record<BatchTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class BatchScheduler {
  private queue: BatchTask[] = [];

  /**
   * 入队任务
   */
  enqueue(task: BatchTask): void {
    // 验证优先级有效性
    let normalizedPriority = task.priority;
    if (!(normalizedPriority in PRIORITY_WEIGHT)) {
      logger.warn(`[BatchScheduler] 无效的优先级值 '${normalizedPriority}'，已降级为 'normal'`);
      normalizedPriority = 'normal';
    }
    this.queue.push({ ...task, priority: normalizedPriority });
    this.bubbleUp(this.queue.length - 1);
  }

  /**
   * 出队最高优先级任务
   */
  dequeue(): BatchTask | undefined {
    if (this.queue.length === 0) return undefined;
    const top = this.queue[0];
    const last = this.queue.pop();
    if (this.queue.length > 0 && last) {
      this.queue[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  /**
   * 查看队首任务（不出队）
   */
  peek(): BatchTask | undefined {
    return this.queue[0];
  }

  /**
   * 获取队列大小
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * 判断队列是否为空
   */
  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * 移除指定任务
   */
  remove(taskId: string): boolean {
    const index = this.queue.findIndex((t) => t.taskId === taskId);
    if (index === -1) return false;

    if (index === this.queue.length - 1) {
      this.queue.pop();
    } else {
      const last = this.queue.pop();
      if (last) {
        this.queue[index] = last;
        this.sinkDown(index);
        this.bubbleUp(index);
      }
    }
    return true;
  }

  private bubbleUp(startIndex: number): void {
    let idx = startIndex;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.compare(this.queue[idx], this.queue[parent]) < 0) {
        [this.queue[idx], this.queue[parent]] = [this.queue[parent], this.queue[idx]];
        idx = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(startIndex: number): void {
    const length = this.queue.length;
    let idx = startIndex;
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let smallest = idx;

      if (left < length && this.compare(this.queue[left], this.queue[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.queue[right], this.queue[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== idx) {
        [this.queue[idx], this.queue[smallest]] = [this.queue[smallest], this.queue[idx]];
        idx = smallest;
      } else {
        break;
      }
    }
  }

  private compare(a: BatchTask, b: BatchTask): number {
    const weightDiff = (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
    if (weightDiff !== 0) return weightDiff;
    // 同优先级按创建时间排序（先创建的先执行）
    return a.createdAt.getTime() - b.createdAt.getTime();
  }
}
