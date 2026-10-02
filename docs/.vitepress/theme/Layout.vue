<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const { Layout } = DefaultTheme;

const banner = ref<HTMLElement | null>(null);
let observer: ResizeObserver | undefined;

// 默认主题用 --vp-layout-top-height 计算导航栏与正文的偏移，横幅高度随视口换行变化，需实测后同步
function syncBannerHeight() {
  const height = banner.value?.offsetHeight ?? 0;
  document.documentElement.style.setProperty('--vp-layout-top-height', `${height}px`);
}

onMounted(() => {
  syncBannerHeight();
  if (typeof ResizeObserver === 'undefined' || !banner.value) return;
  observer = new ResizeObserver(syncBannerHeight);
  observer.observe(banner.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  document.documentElement.style.removeProperty('--vp-layout-top-height');
});
</script>

<template>
  <Layout>
    <template #layout-top>
      <div ref="banner" class="maintenance-banner" role="note">
        <span class="maintenance-banner__icon" aria-hidden="true">🛑</span>
        <span>
          本项目已停止维护，不再接收功能更新与问题修复；如有网页端 SSH / RDP / VNC
          连接需求，请转向其他仍在积极维护的项目。
        </span>
      </div>
    </template>
  </Layout>
</template>
