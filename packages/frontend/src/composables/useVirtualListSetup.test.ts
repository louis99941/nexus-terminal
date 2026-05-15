/**
 * useVirtualListSetup composable 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

// Mock @vueuse/core's useVirtualList
const mockScrollTo = vi.fn();
const mockList = ref([]);
const mockContainerProps = { ref: vi.fn(), onScroll: vi.fn(), style: {} };
const mockWrapperProps = { style: {} };

vi.mock('@vueuse/core', () => ({
  useVirtualList: vi.fn((dataSource, options) => {
    return {
      list: mockList,
      containerProps: mockContainerProps,
      wrapperProps: mockWrapperProps,
      scrollTo: mockScrollTo,
    };
  }),
}));

import { useVirtualList } from '@vueuse/core';
import { useVirtualListSetup } from './useVirtualListSetup';

describe('useVirtualListSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('返回值结构', () => {
    it('应该返回 list、containerProps、wrapperProps 和 scrollTo', () => {
      const dataSource = ref([1, 2, 3]);
      const result = useVirtualListSetup(dataSource, { itemHeight: 50 });

      expect(result).toHaveProperty('list');
      expect(result).toHaveProperty('containerProps');
      expect(result).toHaveProperty('wrapperProps');
      expect(result).toHaveProperty('scrollTo');
    });

    it('scrollTo 应该是函数', () => {
      const dataSource = ref([1, 2, 3]);
      const { scrollTo } = useVirtualListSetup(dataSource, { itemHeight: 50 });
      expect(typeof scrollTo).toBe('function');
    });

    it('应该将 dataSource 传递给 useVirtualList', () => {
      const dataSource = ref(['a', 'b', 'c']);
      useVirtualListSetup(dataSource, { itemHeight: 40 });
      expect(useVirtualList).toHaveBeenCalledWith(dataSource, expect.any(Object));
    });

    it('应该将 itemHeight 传递给 useVirtualList', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 80 });
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ itemHeight: 80 })
      );
    });

    it('应该将函数形式的 itemHeight 传递给 useVirtualList', () => {
      const dataSource = ref([1]);
      const heightFn = () => 60;
      useVirtualListSetup(dataSource, { itemHeight: heightFn });
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ itemHeight: heightFn })
      );
    });
  });

  describe('自动 overscan 缩放（未指定 overscan 时）', () => {
    it('行高 40px 时 overscan 应为 ceil(200/40)=5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 40 });
      // Math.ceil(200/40) = 5, clamp(5, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });

    it('行高 20px 时 overscan 应被钳制到最小值 5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 20 });
      // Math.ceil(200/20) = 10, clamp(10, 5, 15) = 10
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 10 })
      );
    });

    it('行高 200px 时 overscan 应为 ceil(200/200)=1，但钳制到 5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 200 });
      // Math.ceil(200/200) = 1, clamp(1, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });

    it('行高 15px 时 overscan 应为 ceil(200/15)=14', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 15 });
      // Math.ceil(200/15) = 14, clamp(14, 5, 15) = 14
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 14 })
      );
    });

    it('行高 10px 时 overscan 应被钳制到最大值 15', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 10 });
      // Math.ceil(200/10) = 20, clamp(20, 5, 15) = 15
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 15 })
      );
    });

    it('行高 1px 时 overscan 应被钳制到最大值 15', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 1 });
      // Math.ceil(200/1) = 200, clamp(200, 5, 15) = 15
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 15 })
      );
    });

    it('函数形式 itemHeight 应用于 overscan 计算', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: () => 100 });
      // Math.ceil(200/100) = 2, clamp(2, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });
  });

  describe('显式指定 overscan', () => {
    it('指定 overscan 时应使用提供的值而不自动计算', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 50, overscan: 15 });
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 15 })
      );
    });

    it('指定 overscan: 10 时应使用 10', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 50, overscan: 10 });
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 10 })
      );
    });

    it('指定 overscan: 0 时应使用 0', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 50, overscan: 0 });
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 0 })
      );
    });

    it('指定 overscan: 1 时应使用 1（不做钳制）', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 50, overscan: 1 });
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 1 })
      );
    });

    it('overscan 覆盖应与任意 itemHeight 组合工作', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 180, overscan: 10 });
      // 即使 itemHeight=180 会自动计算为 5，显式 overscan=10 优先
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 10 })
      );
    });
  });

  describe('边界情况', () => {
    it('空数组数据源应能正常调用', () => {
      const dataSource = ref<number[]>([]);
      expect(() => useVirtualListSetup(dataSource, { itemHeight: 50 })).not.toThrow();
    });

    it('大型数据源应能正常调用', () => {
      const dataSource = ref(Array.from({ length: 10000 }, (_, i) => i));
      expect(() => useVirtualListSetup(dataSource, { itemHeight: 50 })).not.toThrow();
    });

    it('泛型类型应能与对象数组一起工作', () => {
      const dataSource = ref([{ id: 1, name: 'test' }, { id: 2, name: 'other' }]);
      expect(() => useVirtualListSetup(dataSource, { itemHeight: 60 })).not.toThrow();
      expect(useVirtualList).toHaveBeenCalled();
    });
  });

  describe('返回值身份一致性', () => {
    it('返回的 list 应是 useVirtualList 提供的 list', () => {
      const dataSource = ref([1, 2, 3]);
      const { list } = useVirtualListSetup(dataSource, { itemHeight: 50 });
      expect(list).toBe(mockList);
    });

    it('返回的 containerProps 应是 useVirtualList 提供的 containerProps', () => {
      const dataSource = ref([1, 2, 3]);
      const { containerProps } = useVirtualListSetup(dataSource, { itemHeight: 50 });
      expect(containerProps).toBe(mockContainerProps);
    });

    it('返回的 wrapperProps 应是 useVirtualList 提供的 wrapperProps', () => {
      const dataSource = ref([1, 2, 3]);
      const { wrapperProps } = useVirtualListSetup(dataSource, { itemHeight: 50 });
      expect(wrapperProps).toBe(mockWrapperProps);
    });

    it('返回的 scrollTo 应是 useVirtualList 提供的 scrollTo', () => {
      const dataSource = ref([1, 2, 3]);
      const { scrollTo } = useVirtualListSetup(dataSource, { itemHeight: 50 });
      expect(scrollTo).toBe(mockScrollTo);
    });
  });

  describe('overscan 自动缩放 — 额外边界值', () => {
    it('行高 100px 时 overscan 应为 clamp(ceil(200/100)=2, 5, 15)=5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 100 });
      // Math.ceil(200/100) = 2, clamp(2, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });

    it('行高 50px 时 overscan 应为 clamp(ceil(200/50)=4, 5, 15)=5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 50 });
      // Math.ceil(200/50) = 4, clamp(4, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });

    it('行高 180px 时 overscan 应为 clamp(ceil(200/180)=2, 5, 15)=5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 180 });
      // Math.ceil(200/180) = 2, clamp(2, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });

    it('行高 14px 时 overscan 应为 clamp(ceil(200/14)=15, 5, 15)=15', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: 14 });
      // Math.ceil(200/14) = 15, clamp(15, 5, 15) = 15
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 15 })
      );
    });

    it('函数返回 50px 时 overscan 应为 5', () => {
      const dataSource = ref([1]);
      useVirtualListSetup(dataSource, { itemHeight: () => 50 });
      // Math.ceil(200/50) = 4, clamp(4, 5, 15) = 5
      expect(useVirtualList).toHaveBeenCalledWith(
        dataSource,
        expect.objectContaining({ overscan: 5 })
      );
    });
  });

  describe('useVirtualList 调用次数', () => {
    it('每次调用 useVirtualListSetup 应恰好调用一次 useVirtualList', () => {
      const dataSource = ref([1, 2, 3]);
      useVirtualListSetup(dataSource, { itemHeight: 40 });
      expect(useVirtualList).toHaveBeenCalledTimes(1);
    });

    it('多次调用 useVirtualListSetup 应各自调用一次 useVirtualList', () => {
      const d1 = ref([1]);
      const d2 = ref([2]);
      const d3 = ref([3]);
      useVirtualListSetup(d1, { itemHeight: 40 });
      useVirtualListSetup(d2, { itemHeight: 60 });
      useVirtualListSetup(d3, { itemHeight: 80 });
      expect(useVirtualList).toHaveBeenCalledTimes(3);
    });
  });
});