import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue';
import type { Terminal } from '@xterm/xterm';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

type TerminalTouchTarget = Pick<Terminal, 'rows' | 'scrollLines'> &
  Partial<Pick<Terminal, 'getSelection' | 'clearSelection' | 'paste' | 'selectAll'>>;

export interface TouchGestureOptions {
  terminal: Ref<TerminalTouchTarget | null>;
  containerRef?: Ref<HTMLElement | null>;
  terminalRef?: Ref<HTMLElement | null>;
  getSelection?: () => string | null;
  pasteText?: (text: string) => void;
}

const LONG_PRESS_DELAY = 500;
const MOVE_CANCEL_THRESHOLD = 8;
const SCROLL_STEP_PX = 30;

export function useTouchGestures(options: TouchGestureOptions) {
  const isContextMenuVisible = ref(false);
  const contextMenuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 });

  let attachedElement: HTMLElement | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let lastScrollY = 0;
  let isAttached = false;

  const getContainer = () => options.containerRef?.value ?? options.terminalRef?.value ?? null;

  const clearLongPressTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const hideContextMenu = () => {
    isContextMenuVisible.value = false;
  };

  const showContextMenu = (x: number, y: number) => {
    contextMenuPosition.value = { x, y };
    isContextMenuVisible.value = true;

    // 长按反馈只在支持振动的移动设备上触发。
    navigator.vibrate?.(35);
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      clearLongPressTimer();
      return;
    }

    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    lastScrollY = touch.clientY;

    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
      showContextMenu(touchStartX, touchStartY);
      longPressTimer = null;
    }, LONG_PRESS_DELAY);
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      clearLongPressTimer();
      return;
    }

    const touch = event.touches[0];
    const totalDeltaX = touch.clientX - touchStartX;
    const totalDeltaY = touch.clientY - touchStartY;

    if (Math.hypot(totalDeltaX, totalDeltaY) > MOVE_CANCEL_THRESHOLD) {
      clearLongPressTimer();
    }

    const terminal = options.terminal.value;
    if (!terminal) return;

    let scrollDelta = lastScrollY - touch.clientY;
    const stepLines = Math.max(1, Math.round(terminal.rows / 3));

    while (Math.abs(scrollDelta) >= SCROLL_STEP_PX) {
      const direction = scrollDelta > 0 ? 1 : -1;
      terminal.scrollLines(stepLines * direction);
      lastScrollY -= SCROLL_STEP_PX * direction;
      scrollDelta = lastScrollY - touch.clientY;
    }

    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const handleTouchEnd = () => {
    clearLongPressTimer();
  };

  const handleGlobalTouchStart = (event: TouchEvent) => {
    if (!isContextMenuVisible.value) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-touch-context-menu="true"]')) return;
    if (target && getContainer()?.contains(target)) return;

    hideContextMenu();
  };

  const handleCopy = async () => {
    const selectedText =
      options.getSelection?.() ?? options.terminal.value?.getSelection?.() ?? null;
    if (!selectedText) {
      hideContextMenu();
      return;
    }

    await navigator.clipboard.writeText(selectedText);
    options.terminal.value?.clearSelection?.();
    hideContextMenu();
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    if (text) {
      if (options.pasteText) {
        options.pasteText(text);
      } else {
        options.terminal.value?.paste?.(text);
      }
    }
    hideContextMenu();
  };

  const handleSelectAll = () => {
    options.terminal.value?.selectAll?.();
    hideContextMenu();
  };

  const attach = () => {
    if (isAttached) return;
    const container = getContainer();
    if (!container) return;

    attachedElement = container;
    attachedElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    attachedElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    attachedElement.addEventListener('touchend', handleTouchEnd);
    attachedElement.addEventListener('touchcancel', handleTouchEnd);
    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true });
    isAttached = true;
  };

  const detach = () => {
    clearLongPressTimer();
    hideContextMenu();

    if (attachedElement) {
      attachedElement.removeEventListener('touchstart', handleTouchStart);
      attachedElement.removeEventListener('touchmove', handleTouchMove);
      attachedElement.removeEventListener('touchend', handleTouchEnd);
      attachedElement.removeEventListener('touchcancel', handleTouchEnd);
    }
    document.removeEventListener('touchstart', handleGlobalTouchStart);
    attachedElement = null;
    isAttached = false;
  };

  if (getCurrentInstance()) {
    onBeforeUnmount(detach);
  }

  return {
    isContextMenuVisible,
    contextMenuPosition,
    hideContextMenu,
    handleCopy,
    handlePaste,
    handleSelectAll,
    attach,
    detach,
  };
}
