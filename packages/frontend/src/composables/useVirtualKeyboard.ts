/**
 * useVirtualKeyboard composable
 * 通过 VisualViewport API 检测虚拟键盘弹出，动态调整终端容器高度
 * 兼容 iOS Safari 和 Chrome Android
 */

import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

export interface VirtualKeyboardState {
  /** 虚拟键盘是否弹出 */
  isVisible: boolean;
  /** 键盘高度（像素） */
  keyboardHeight: number;
  /** 视口高度变化量 */
  viewportDelta: number;
}

/**
 * 检测虚拟键盘弹出并动态调整布局
 * @param containerRef - 需要调整高度的容器元素引用
 * @returns 虚拟键盘状态
 */
export function useVirtualKeyboard(containerRef?: Ref<HTMLElement | null>) {
  const isVisible = ref(false);
  const keyboardHeight = ref(0);
  const viewportDelta = ref(0);

  // 记录初始视口高度（键盘未弹出时）
  let initialViewportHeight = 0;
  let viewport: VisualViewport | null = null;

  /**
   * 处理视口尺寸变化（键盘弹出/收起）
   * iOS Safari：window.visualViewport.resize 事件
   * Chrome Android：通过 height 变化检测
   */
  const handleViewportResize = () => {
    // 获取当前视口高度（优先 VisualViewport API，降级到 window.innerHeight）
    const currentHeight = viewport ? viewport.height : window.innerHeight;
    const heightDiff = initialViewportHeight - currentHeight;

    // 阈值：高度变化超过 100px 才认为是键盘弹出（避免地址栏收起误判）
    const THRESHOLD = 100;

    if (heightDiff > THRESHOLD) {
      isVisible.value = true;
      keyboardHeight.value = Math.round(heightDiff);
      viewportDelta.value = Math.round(heightDiff);

      // 动态调整容器高度
      if (containerRef?.value) {
        const container = containerRef.value;
        container.style.height = `${currentHeight}px`;
        container.style.maxHeight = `${currentHeight}px`;
      }
    } else {
      isVisible.value = false;
      keyboardHeight.value = 0;
      viewportDelta.value = 0;

      // 恢复容器高度
      if (containerRef?.value) {
        const container = containerRef.value;
        container.style.height = '';
        container.style.maxHeight = '';
      }
    }
  };

  /**
   * 处理窗口焦点变化（辅助检测键盘收起）
   * 当输入框失焦时，键盘收起，但 resize 事件可能延迟触发
   */
  const handleBlur = () => {
    // 延迟检测，等待键盘动画完成
    setTimeout(() => {
      if (viewport && viewport.height >= initialViewportHeight - 50) {
        isVisible.value = false;
        keyboardHeight.value = 0;
        viewportDelta.value = 0;

        if (containerRef?.value) {
          containerRef.value.style.height = '';
          containerRef.value.style.maxHeight = '';
        }
      }
    }, 300);
  };

  onMounted(() => {
    if (typeof window === 'undefined') return;

    viewport = window.visualViewport || null;

    if (viewport) {
      initialViewportHeight = viewport.height;

      viewport.addEventListener('resize', handleViewportResize);
      viewport.addEventListener('scroll', handleViewportResize);
    } else {
      // 降级方案：使用 window.resize 事件
      initialViewportHeight = window.innerHeight;
      window.addEventListener('resize', handleViewportResize);
    }

    // 监听失焦事件
    window.addEventListener('blur', handleBlur);
  });

  onBeforeUnmount(() => {
    if (viewport) {
      viewport.removeEventListener('resize', handleViewportResize);
      viewport.removeEventListener('scroll', handleViewportResize);
    } else {
      window.removeEventListener('resize', handleViewportResize);
    }
    window.removeEventListener('blur', handleBlur);

    // 恢复容器样式
    if (containerRef?.value) {
      containerRef.value.style.height = '';
      containerRef.value.style.maxHeight = '';
    }
  });

  return {
    isVisible,
    keyboardHeight,
    viewportDelta,
  };
}
