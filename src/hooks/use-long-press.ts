import { useEffect, useRef, type MouseEvent, type PointerEvent, type TouchEvent } from "react";

type LongPressOptions = {
  /** Off → no handlers (e.g. mouse devices keep their hover toolbars). */
  enabled?: boolean;
  /** Hold time before firing; slightly under the OS text-selection delay. */
  delay?: number;
};

const MOVE_TOLERANCE = 10;

/**
 * Touch long-press → `onLongPress` (the tap alternative to hover-only toolbars). Only touch pointers
 * count; moving the finger (scrolling) cancels; the click and the native context menu that follow a
 * fired press are swallowed so the row does not also "tap" — and neither does whatever the press
 * opened under the finger (an action sheet item), see onTouchEnd.
 */
export const useLongPress = (
  onLongPress: () => void,
  { enabled = true, delay = 450 }: LongPressOptions = {}
) => {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  /** The current touch already fired: its release must not become a click. */
  const firedThisTouch = useRef(false);
  const callback = useRef(onLongPress);

  useEffect(() => {
    callback.current = onLongPress;
  }, [onLongPress]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  if (!enabled) return {};

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  // React bubbles portal events through their owner: only presses on the element's own DOM count.
  const ownTarget = (event: { currentTarget: EventTarget; target: EventTarget }) =>
    event.currentTarget instanceof Node &&
    event.target instanceof Node &&
    event.currentTarget.contains(event.target);

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch" || !event.isPrimary || !ownTarget(event)) return;
      cancel();
      fired.current = false;
      firedThisTouch.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        origin.current = null;
        fired.current = true;
        firedThisTouch.current = true;
        // Browsers usually send no click after a long press; never let the flag outlive the gesture.
        window.setTimeout(() => {
          fired.current = false;
        }, 700);
        if (typeof navigator.vibrate === "function") navigator.vibrate(8);
        callback.current();
      }, delay);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = origin.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // Touch events stay with the row even when a sheet now covers the finger: cancelling the release
    // stops the browser from "clicking" the sheet item that appeared under it (holding a message near
    // the composer used to open its thread straight away).
    onTouchEnd: (event: TouchEvent<HTMLElement>) => {
      if (!firedThisTouch.current) return;
      firedThisTouch.current = false;
      if (event.cancelable) event.preventDefault();
    },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (ownTarget(event) && (fired.current || timer.current !== null)) event.preventDefault();
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!fired.current || !ownTarget(event)) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };
};
