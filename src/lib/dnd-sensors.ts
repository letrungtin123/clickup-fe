import {
  MouseSensor,
  TouchSensor,
  type MouseSensorOptions,
  type TouchSensorOptions
} from "@dnd-kit/core";
import type { MouseEvent, SyntheticEvent, TouchEvent } from "react";

/**
 * Mouse + touch drag sensors that ignore presses starting on a control inside the draggable
 * (status/assignee/date cells, "…" buttons, inputs). Used instead of PointerSensor, which also
 * reacts to touch pointers — a finger scrolling a list would start a drag after a few pixels.
 * Touch drags use TouchSensor's press-and-hold delay, so swipes keep scrolling.
 */
export const createControlAwareSensors = (
  controlSelector: string
): { MouseSensor: typeof MouseSensor; TouchSensor: typeof TouchSensor } => {
  const startsOnControl = (event: SyntheticEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest(controlSelector);
    return Boolean(
      control &&
      control !== event.currentTarget &&
      event.currentTarget instanceof Element &&
      event.currentTarget.contains(control)
    );
  };

  class ControlAwareMouseSensor extends MouseSensor {
    static override activators = [
      {
        eventName: "onMouseDown" as const,
        handler: (event: MouseEvent, options: MouseSensorOptions) => {
          if (event.nativeEvent.button !== 0 || startsOnControl(event)) return false;
          options.onActivation?.({ event: event.nativeEvent });
          return true;
        }
      }
    ];
  }

  class ControlAwareTouchSensor extends TouchSensor {
    static override activators = [
      {
        eventName: "onTouchStart" as const,
        handler: (event: TouchEvent, options: TouchSensorOptions) => {
          if (event.nativeEvent.touches.length > 1 || startsOnControl(event)) return false;
          options.onActivation?.({ event: event.nativeEvent });
          return true;
        }
      }
    ];
  }

  return { MouseSensor: ControlAwareMouseSensor, TouchSensor: ControlAwareTouchSensor };
};
