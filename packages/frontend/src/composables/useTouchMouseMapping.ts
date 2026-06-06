import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue';
import GuacamoleDefault from 'guacamole-common-js';

export type MouseMappingMode = 'absolute' | 'relative';

export interface TouchMouseMappingOptions {
  guacClient?: Ref<GuacamoleClientLike | null>;
  displayEl?: Ref<HTMLElement | null>;
  client?: Ref<GuacamoleClientLike | null>;
  element?: Ref<HTMLElement | null>;
  Guacamole?: typeof GuacamoleDefault;
  initialMode?: MouseMappingMode;
}

interface MouseStateLike {
  x: number;
  y: number;
  left: boolean;
  middle: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

interface GuacamoleClientLike {
  sendMouseState(state: MouseStateLike): void;
}

type GuacamoleRuntime = typeof GuacamoleDefault & {
  Mouse: typeof GuacamoleDefault.Mouse & {
    State?: new (
      x: number,
      y: number,
      left: boolean,
      middle: boolean,
      right: boolean,
      up: boolean,
      down: boolean
    ) => MouseStateLike;
  };
};

interface TouchPoint {
  x: number;
  y: number;
}

const LONG_PRESS_DELAY = 500;
const MOVE_CANCEL_THRESHOLD = 8;
const RELATIVE_SENSITIVITY = 1.5;

export function useTouchMouseMapping(options: TouchMouseMappingOptions) {
  const mode = ref<MouseMappingMode>(options.initialMode ?? 'absolute');

  let attachedElement: HTMLElement | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTouch: TouchPoint | null = null;
  let startTouch: TouchPoint | null = null;
  let lastSentPosition: TouchPoint = { x: 0, y: 0 };
  let isAttached = false;
  let longPressTriggered = false;
  let suppressNextClickRelease = false;

  const getClient = () => options.guacClient?.value ?? options.client?.value ?? null;
  const getElement = () => options.displayEl?.value ?? options.element?.value ?? null;
  const getGuacamole = () => (options.Guacamole ?? GuacamoleDefault) as GuacamoleRuntime;

  const clearLongPressTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const setMode = (newMode: MouseMappingMode) => {
    mode.value = newMode;
    lastTouch = null;
    lastSentPosition = { x: 0, y: 0 };
  };

  const createMouseState = (
    x: number,
    y: number,
    buttons: { left?: boolean; middle?: boolean; right?: boolean } = {}
  ): MouseStateLike => {
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    const left = Boolean(buttons.left);
    const middle = Boolean(buttons.middle);
    const right = Boolean(buttons.right);
    const StateCtor = getGuacamole().Mouse.State;

    if (StateCtor) {
      return new StateCtor(roundedX, roundedY, left, middle, right, false, false);
    }

    // 类型声明缺少 State 构造函数时，使用 Guacamole 兼容的状态对象。
    return {
      x: roundedX,
      y: roundedY,
      left,
      middle,
      right,
      up: false,
      down: false,
    };
  };

  const sendState = (
    point: TouchPoint,
    buttons: { left?: boolean; middle?: boolean; right?: boolean } = {}
  ) => {
    const client = getClient();
    if (!client) return;

    client.sendMouseState(createMouseState(point.x, point.y, buttons));
    lastSentPosition = point;
  };

  const getAbsolutePoint = (touch: Touch): TouchPoint => {
    const element = getElement();
    const rect = element?.getBoundingClientRect();
    if (!rect) return { x: touch.clientX, y: touch.clientY };

    return {
      x: Math.min(Math.max(touch.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(touch.clientY - rect.top, 0), rect.height),
    };
  };

  const getRelativePoint = (touch: Touch): TouchPoint => {
    if (!lastTouch) return lastSentPosition;

    return {
      x: lastSentPosition.x + (touch.clientX - lastTouch.x) * RELATIVE_SENSITIVITY,
      y: lastSentPosition.y + (touch.clientY - lastTouch.y) * RELATIVE_SENSITIVITY,
    };
  };

  const getMappedPoint = (touch: Touch): TouchPoint => {
    if (mode.value === 'relative') {
      return getRelativePoint(touch);
    }
    return getAbsolutePoint(touch);
  };

  const getCenterPoint = (touches: TouchList): TouchPoint => {
    const first = touches[0];
    const second = touches[1] ?? touches[0];
    const centerTouch = {
      clientX: (first.clientX + second.clientX) / 2,
      clientY: (first.clientY + second.clientY) / 2,
    } as Touch;

    return mode.value === 'relative' ? lastSentPosition : getAbsolutePoint(centerTouch);
  };

  const sendClick = (point: TouchPoint, button: 'left' | 'right') => {
    sendState(point, { [button]: true });
    sendState(point, { [button]: false });
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      clearLongPressTimer();
      lastTouch = null;
      startTouch = null;
      return;
    }

    if (event.touches.length !== 1) return;

    if (event.cancelable) {
      event.preventDefault();
    }

    const touch = event.touches[0];
    const point = getMappedPoint(touch);

    startTouch = { x: touch.clientX, y: touch.clientY };
    lastTouch = { x: touch.clientX, y: touch.clientY };
    longPressTriggered = false;
    suppressNextClickRelease = false;

    sendState(point, { left: true });

    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
      const currentPoint = mode.value === 'relative' ? lastSentPosition : getAbsolutePoint(touch);
      sendState(currentPoint, { left: false });
      sendClick(currentPoint, 'right');
      longPressTriggered = true;
      suppressNextClickRelease = true;
      longPressTimer = null;
    }, LONG_PRESS_DELAY);
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      clearLongPressTimer();
      return;
    }

    if (event.cancelable) {
      event.preventDefault();
    }

    const touch = event.touches[0];
    const point = getMappedPoint(touch);

    if (
      startTouch &&
      Math.hypot(touch.clientX - startTouch.x, touch.clientY - startTouch.y) > MOVE_CANCEL_THRESHOLD
    ) {
      clearLongPressTimer();
    }

    sendState(point, { left: !longPressTriggered });
    lastTouch = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent) => {
    clearLongPressTimer();

    if (event.changedTouches.length >= 2) {
      sendClick(getCenterPoint(event.changedTouches), 'right');
      lastTouch = null;
      startTouch = null;
      return;
    }

    const touch = event.changedTouches[0];
    if (touch && !suppressNextClickRelease) {
      sendState(mode.value === 'relative' ? lastSentPosition : getAbsolutePoint(touch), {
        left: false,
      });
    }

    lastTouch = null;
    startTouch = null;
    suppressNextClickRelease = false;
    longPressTriggered = false;
  };

  const attach = () => {
    if (isAttached) return;
    const element = getElement();
    if (!element) return;

    attachedElement = element;
    attachedElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    attachedElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    attachedElement.addEventListener('touchend', handleTouchEnd, { passive: false });
    attachedElement.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    isAttached = true;
  };

  const detach = () => {
    clearLongPressTimer();

    if (attachedElement) {
      attachedElement.removeEventListener('touchstart', handleTouchStart);
      attachedElement.removeEventListener('touchmove', handleTouchMove);
      attachedElement.removeEventListener('touchend', handleTouchEnd);
      attachedElement.removeEventListener('touchcancel', handleTouchEnd);
    }

    attachedElement = null;
    lastTouch = null;
    startTouch = null;
    isAttached = false;
    suppressNextClickRelease = false;
    longPressTriggered = false;
  };

  if (getCurrentInstance()) {
    onBeforeUnmount(detach);
  }

  return {
    mode,
    setMode,
    attach,
    detach,
  };
}
