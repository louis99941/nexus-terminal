/**
 * WebGPU 渲染能力管理
 * 当前用于检测 WebGPU 能力并初始化 GPUDevice，为后续接入 xterm WebGPU 渲染器预留设备层。
 */

import { ref, type Ref } from 'vue';
import { log } from '@/utils/log';

export type WebGPUState = 'unsupported' | 'available' | 'active' | 'error';

interface WebGPUNavigator extends Navigator {
  gpu?: {
    requestAdapter: () => Promise<WebGPUAdapter | null>;
  };
}

export interface WebGPUDevice {
  destroy: () => void;
}

interface WebGPUAdapter {
  requestDevice: () => Promise<WebGPUDevice>;
}

export interface WebGPURenderer {
  /** WebGPU 当前能力状态 */
  webgpuState: Ref<WebGPUState>;
  /** 当前已初始化的 GPUDevice */
  gpuDevice: Ref<WebGPUDevice | null>;
  /** 检测浏览器是否支持 WebGPU 并可获取适配器 */
  isWebGPUSupported: () => Promise<boolean>;
  /** 初始化 GPUDevice，成功时返回设备实例 */
  initGPUDevice: () => Promise<WebGPUDevice | null>;
  /** 释放 GPUDevice 资源 */
  dispose: () => void;
}

export function useWebGPURenderer(): WebGPURenderer {
  const webgpuState = ref<WebGPUState>('unsupported');
  const gpuDevice = ref<WebGPUDevice | null>(null);

  let gpuAdapter: WebGPUAdapter | null = null;
  let initPromise: Promise<WebGPUDevice | null> | null = null;

  /**
   * 检测 WebGPU API 与适配器是否可用
   * @returns WebGPU 是否可用于初始化设备
   */
  async function isWebGPUSupported(): Promise<boolean> {
    const webgpuNavigator =
      typeof navigator === 'undefined' ? null : (navigator as WebGPUNavigator);

    if (!webgpuNavigator?.gpu) {
      webgpuState.value = 'unsupported';
      log.info('[WebGPU] 当前环境不支持 navigator.gpu，使用降级渲染');
      return false;
    }

    try {
      gpuAdapter = await webgpuNavigator.gpu.requestAdapter();
      if (!gpuAdapter) {
        webgpuState.value = 'unsupported';
        log.info('[WebGPU] 未获取到可用 GPUAdapter，使用降级渲染');
        return false;
      }

      webgpuState.value = gpuDevice.value ? 'active' : 'available';
      return true;
    } catch (error: unknown) {
      webgpuState.value = 'error';
      log.warn('[WebGPU] 检测 WebGPU 能力失败，使用降级渲染:', error);
      return false;
    }
  }

  /**
   * 初始化 GPUDevice
   * 当前设备仅作为能力与资源准备层，实际终端渲染仍由现有 WebGL addon 承担。
   */
  async function initGPUDevice(): Promise<WebGPUDevice | null> {
    if (gpuDevice.value) {
      webgpuState.value = 'active';
      return gpuDevice.value;
    }

    // 防止并发调用时创建多个 GPUDevice 实例
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      const supported = await isWebGPUSupported();
      if (!supported || !gpuAdapter) {
        return null;
      }

      try {
        const device = await gpuAdapter.requestDevice();
        gpuDevice.value = device;
        webgpuState.value = 'active';
        log.info('[WebGPU] GPUDevice 初始化成功');
        return device;
      } catch (error: unknown) {
        gpuDevice.value = null;
        webgpuState.value = 'error';
        log.warn('[WebGPU] GPUDevice 初始化失败，使用降级渲染:', error);
        return null;
      }
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  }

  /**
   * 释放 GPUDevice
   */
  function dispose(): void {
    if (gpuDevice.value) {
      try {
        gpuDevice.value.destroy();
      } catch (error: unknown) {
        log.warn('[WebGPU] 释放 GPUDevice 时发生异常:', error);
      }
      gpuDevice.value = null;
    }

    gpuAdapter = null;
    initPromise = null;
    webgpuState.value = 'unsupported';
  }

  return {
    webgpuState,
    gpuDevice,
    isWebGPUSupported,
    initGPUDevice,
    dispose,
  };
}
