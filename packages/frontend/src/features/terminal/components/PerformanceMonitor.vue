<script setup lang="ts">
/**
 * PerformanceMonitor 组件
 * 半透明悬浮面板，实时展示终端渲染性能指标
 * 包括：渲染模式、FPS、帧耗时、WebGL 上下文状态与丢失次数
 */

import { computed } from 'vue';
import type { RenderMetrics } from '../../../composables/terminal/useTerminalRenderer';

const props = defineProps<{
  /** 渲染性能指标 */
  metrics: RenderMetrics;
  /** 是否显示面板 */
  visible: boolean;
}>();

/** 渲染模式标签映射 */
const renderModeLabel: Record<string, string> = {
  auto: '自动',
  webgl: 'WebGL',
  canvas: 'Canvas',
  dom: 'DOM',
};

/** 上下文状态标签映射 */
const contextStateLabel: Record<string, string> = {
  active: 'Active',
  lost: 'Lost',
  unavailable: 'Unavailable',
};

/** 根据 FPS 值返回对应颜色类 */
const fpsColorClass = computed(() => {
  const fps = props.metrics.fps;
  if (fps > 50) return 'text-green-400';
  if (fps >= 30) return 'text-yellow-400';
  return 'text-red-400';
});

/** 上下文状态对应的指示颜色 */
const contextDotColor = computed(() => {
  switch (props.metrics.contextState) {
    case 'active':
      return 'bg-green-400';
    case 'lost':
      return 'bg-yellow-400';
    case 'unavailable':
      return 'bg-red-400';
  }
});
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      class="absolute top-2 right-2 z-10 rounded-md bg-black/70 px-3 py-2 font-mono text-xs leading-relaxed text-gray-300 backdrop-blur-sm select-none pointer-events-none"
    >
      <!-- 渲染模式 -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500">渲染:</span>
        <span class="text-white">{{
          renderModeLabel[metrics.renderMode] ?? metrics.renderMode
        }}</span>
        <span class="text-gray-600">({{ metrics.activeRenderer.toUpperCase() }})</span>
      </div>

      <!-- FPS -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500">FPS:</span>
        <span :class="fpsColorClass" class="font-semibold">{{ metrics.fps }}</span>
      </div>

      <!-- 帧耗时 -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500">帧耗时:</span>
        <span class="text-white">{{ metrics.frameTime }}ms</span>
      </div>

      <!-- WebGL 上下文状态 -->
      <div class="flex items-center gap-2">
        <span class="text-gray-500">GPU:</span>
        <span class="inline-flex items-center gap-1.5">
          <span :class="contextDotColor" class="inline-block h-1.5 w-1.5 rounded-full"></span>
          <span class="text-white">{{
            contextStateLabel[metrics.contextState] ?? metrics.contextState
          }}</span>
        </span>
      </div>

      <!-- Context Loss 次数（仅 >0 时显示） -->
      <div v-if="metrics.contextLossCount > 0" class="flex items-center gap-2">
        <span class="text-gray-500">丢失:</span>
        <span class="text-red-400 font-semibold">{{ metrics.contextLossCount }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 面板淡入淡出过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
