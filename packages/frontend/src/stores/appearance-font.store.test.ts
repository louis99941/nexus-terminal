import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { createFontStore } from './appearance-font.store';
import type { AppearanceSettings } from '../types/appearance.types';

function createMockDeps(overrides: Partial<AppearanceSettings> = {}) {
  const settings = ref<Partial<AppearanceSettings>>({
    terminalFontSize: 14,
    terminalFontSizeMobile: 14,
    editorFontSize: 14,
    mobileEditorFontSize: 16,
    ...overrides,
  });
  return {
    appearanceSettings: settings,
    updateAppearanceSettings: vi.fn().mockResolvedValue(undefined),
  };
}

describe('appearance-font.store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('终端字体计算属性', () => {
    it('currentTerminalFontFamily 应返回设置值', () => {
      const deps = createMockDeps({ terminalFontFamily: 'Fira Code' });
      const store = createFontStore(deps);
      expect(store.currentTerminalFontFamily.value).toBe('Fira Code');
    });

    it('currentTerminalFontFamily 未设置时应返回默认值', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.currentTerminalFontFamily.value).toContain('Consolas');
    });

    it('currentTerminalFontSize 应返回有效数字', () => {
      const deps = createMockDeps({ terminalFontSize: 16 });
      const store = createFontStore(deps);
      expect(store.currentTerminalFontSize.value).toBe(16);
    });

    it('currentTerminalFontSize 无效值应返回默认 14', () => {
      const deps = createMockDeps({ terminalFontSize: -1 });
      const store = createFontStore(deps);
      expect(store.currentTerminalFontSize.value).toBe(14);
    });

    it('terminalFontSizeDesktop 应返回设置值', () => {
      const deps = createMockDeps({ terminalFontSize: 18 });
      const store = createFontStore(deps);
      expect(store.terminalFontSizeDesktop.value).toBe(18);
    });

    it('terminalFontSizeMobile 应返回设置值', () => {
      const deps = createMockDeps({ terminalFontSizeMobile: 12 });
      const store = createFontStore(deps);
      expect(store.terminalFontSizeMobile.value).toBe(12);
    });

    it('terminalFontSizeMobile 无效值应返回默认 14', () => {
      const deps = createMockDeps({ terminalFontSizeMobile: 0 });
      const store = createFontStore(deps);
      expect(store.terminalFontSizeMobile.value).toBe(14);
    });
  });

  describe('编辑器字体计算属性', () => {
    it('currentEditorFontSize 应返回设置值', () => {
      const deps = createMockDeps({ editorFontSize: 16 });
      const store = createFontStore(deps);
      expect(store.currentEditorFontSize.value).toBe(16);
    });

    it('currentEditorFontSize 无效值应返回默认 14', () => {
      const deps = createMockDeps({ editorFontSize: 0 });
      const store = createFontStore(deps);
      expect(store.currentEditorFontSize.value).toBe(14);
    });

    it('currentEditorFontFamily 应返回设置值', () => {
      const deps = createMockDeps({ editorFontFamily: 'Monaco' });
      const store = createFontStore(deps);
      expect(store.currentEditorFontFamily.value).toBe('Monaco');
    });

    it('currentEditorFontFamily 未设置时应返回默认值', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.currentEditorFontFamily.value).toContain('Consolas');
    });

    it('currentMobileEditorFontSize 应返回设置值', () => {
      const deps = createMockDeps({ mobileEditorFontSize: 20 });
      const store = createFontStore(deps);
      expect(store.currentMobileEditorFontSize.value).toBe(20);
    });

    it('currentMobileEditorFontSize 无效值应返回默认 16', () => {
      const deps = createMockDeps({ mobileEditorFontSize: -5 });
      const store = createFontStore(deps);
      expect(store.currentMobileEditorFontSize.value).toBe(16);
    });
  });

  describe('文字描边计算属性', () => {
    it('terminalTextStrokeEnabled 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextStrokeEnabled: true });
      const store = createFontStore(deps);
      expect(store.terminalTextStrokeEnabled.value).toBe(true);
    });

    it('terminalTextStrokeEnabled 未设置时应默认 false', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.terminalTextStrokeEnabled.value).toBe(false);
    });

    it('terminalTextStrokeWidth 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextStrokeWidth: 2 });
      const store = createFontStore(deps);
      expect(store.terminalTextStrokeWidth.value).toBe(2);
    });

    it('terminalTextStrokeWidth 未设置时应默认 1', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.terminalTextStrokeWidth.value).toBe(1);
    });

    it('terminalTextStrokeColor 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextStrokeColor: '#ff0000' });
      const store = createFontStore(deps);
      expect(store.terminalTextStrokeColor.value).toBe('#ff0000');
    });

    it('terminalTextStrokeColor 未设置时应默认黑色', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.terminalTextStrokeColor.value).toBe('#000000');
    });
  });

  describe('文字阴影计算属性', () => {
    it('terminalTextShadowEnabled 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextShadowEnabled: true });
      const store = createFontStore(deps);
      expect(store.terminalTextShadowEnabled.value).toBe(true);
    });

    it('terminalTextShadowEnabled 未设置时应默认 false', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.terminalTextShadowEnabled.value).toBe(false);
    });

    it('terminalTextShadowOffsetX 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextShadowOffsetX: 2 });
      const store = createFontStore(deps);
      expect(store.terminalTextShadowOffsetX.value).toBe(2);
    });

    it('terminalTextShadowOffsetY 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextShadowOffsetY: 3 });
      const store = createFontStore(deps);
      expect(store.terminalTextShadowOffsetY.value).toBe(3);
    });

    it('terminalTextShadowBlur 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextShadowBlur: 5 });
      const store = createFontStore(deps);
      expect(store.terminalTextShadowBlur.value).toBe(5);
    });

    it('terminalTextShadowColor 应返回设置值', () => {
      const deps = createMockDeps({ terminalTextShadowColor: 'rgba(0,0,0,0.8)' });
      const store = createFontStore(deps);
      expect(store.terminalTextShadowColor.value).toBe('rgba(0,0,0,0.8)');
    });

    it('terminalTextShadowColor 未设置时应返回默认值', () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);
      expect(store.terminalTextShadowColor.value).toBe('rgba(0,0,0,0.5)');
    });
  });

  describe('字体设置方法', () => {
    it('setTerminalFontFamily 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalFontFamily('JetBrains Mono');

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({
        terminalFontFamily: 'JetBrains Mono',
      });
    });

    it('setTerminalFontSize 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalFontSize(18);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ terminalFontSize: 18 });
    });

    it('setTerminalFontSizeMobile 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalFontSizeMobile(12);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ terminalFontSizeMobile: 12 });
    });

    it('setEditorFontSize 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setEditorFontSize(16);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ editorFontSize: 16 });
    });

    it('setEditorFontFamily 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setEditorFontFamily('Monaco');

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ editorFontFamily: 'Monaco' });
    });

    it('setMobileEditorFontSize 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setMobileEditorFontSize(20);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ mobileEditorFontSize: 20 });
    });
  });

  describe('文字描边设置方法', () => {
    it('setTerminalTextStrokeEnabled 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextStrokeEnabled(true);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({
        terminalTextStrokeEnabled: true,
      });
    });

    it('setTerminalTextStrokeWidth 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextStrokeWidth(3);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ terminalTextStrokeWidth: 3 });
    });

    it('setTerminalTextStrokeColor 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextStrokeColor('#ff0000');

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({
        terminalTextStrokeColor: '#ff0000',
      });
    });
  });

  describe('文字阴影设置方法', () => {
    it('setTerminalTextShadowEnabled 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextShadowEnabled(true);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({
        terminalTextShadowEnabled: true,
      });
    });

    it('setTerminalTextShadowOffsetX 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextShadowOffsetX(5);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ terminalTextShadowOffsetX: 5 });
    });

    it('setTerminalTextShadowOffsetY 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextShadowOffsetY(3);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ terminalTextShadowOffsetY: 3 });
    });

    it('setTerminalTextShadowBlur 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextShadowBlur(10);

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({ terminalTextShadowBlur: 10 });
    });

    it('setTerminalTextShadowColor 应调用 updateAppearanceSettings', async () => {
      const deps = createMockDeps();
      const store = createFontStore(deps);

      await store.setTerminalTextShadowColor('rgba(0,0,0,0.3)');

      expect(deps.updateAppearanceSettings).toHaveBeenCalledWith({
        terminalTextShadowColor: 'rgba(0,0,0,0.3)',
      });
    });
  });
});
