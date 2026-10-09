import { cn } from "cn";
import { Check, type LucideIcon } from "lucide-react";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { colorTokens, type ColorToken } from "@/contracts/work";
import { colorTokenLabels, toneClass } from "@/lib/colors";

import { projectIconKeys, projectIcons, type ProjectIconKey } from "./project-icons";

/**
 * Roving radio-group keyboard model shared by the controls below: one tab stop, arrow keys move and
 * select (like native radios), Home/End jump to the ends.
 */
const useRovingRadio = <T,>(values: readonly T[], value: T, onChange: (next: T) => void) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = values.length - 1;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === -1) return;
    event.preventDefault();
    const nextValue = values[next];
    if (nextValue !== undefined) {
      onChange(nextValue);
      refs.current[next]?.focus();
    }
  };
  const selectedIndex = Math.max(0, values.indexOf(value));
  return {
    itemProps: (index: number) => ({
      ref: (node: HTMLButtonElement | null) => {
        refs.current[index] = node;
      },
      role: "radio" as const,
      type: "button" as const,
      tabIndex: index === selectedIndex ? 0 : -1,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, index)
    })
  };
};

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  description?: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  /** Visually show icons only (labels stay available to assistive tech). */
  iconOnly?: boolean;
};

/** Pill-style single choice (radiogroup), e.g. Public | Private, List | Board | Table. */
export const SegmentedControl = <T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  disabled,
  iconOnly = false,
  ...aria
}: SegmentedControlProps<T>) => {
  const { itemProps } = useRovingRadio(
    options.map((option) => option.value),
    value,
    onChange
  );
  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5",
        disabled && "opacity-60",
        className
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            {...itemProps(index)}
            aria-checked={checked}
            disabled={disabled}
            title={option.description}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-foreground-muted transition-[background-color,color,box-shadow] duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
              size === "md"
                ? "h-7 px-3 text-[13px] pointer-coarse:h-9 [&_svg]:size-3.5"
                : "h-6 px-2 text-xs pointer-coarse:h-9 pointer-coarse:min-w-10 [&_svg]:size-3.5",
              checked &&
                "bg-surface text-foreground shadow-sm ring-1 ring-border/70 dark:bg-input dark:ring-0"
            )}
          >
            {Icon ? <Icon aria-hidden="true" /> : null}
            <span className={iconOnly ? "sr-only" : undefined}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
};

type ColorSwatchPickerProps = {
  value: ColorToken;
  onChange: (value: ColorToken) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
};

export const ColorSwatchPicker = ({
  value,
  onChange,
  className,
  ...aria
}: ColorSwatchPickerProps) => {
  const { itemProps } = useRovingRadio(colorTokens, value, onChange);
  return (
    <div role="radiogroup" {...aria} className={cn("flex flex-wrap gap-1.5", className)}>
      {colorTokens.map((token, index) => {
        const checked = token === value;
        return (
          <button
            key={token}
            {...itemProps(index)}
            aria-checked={checked}
            aria-label={colorTokenLabels[token]}
            title={colorTokenLabels[token]}
            onClick={() => onChange(token)}
            className={cn(
              toneClass(token),
              "flex size-6 items-center justify-center rounded-full bg-(--tone-solid) text-(--tone-on) pointer-coarse:size-8 ring-offset-2 ring-offset-background transition-transform duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
              checked && "ring-2 ring-(--tone)"
            )}
          >
            {checked ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
};

type IconPickerProps = {
  value: ProjectIconKey | null;
  onChange: (value: ProjectIconKey | null) => void;
  color: ColorToken;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  className?: string;
  /** Rendered as the first option (no icon → name initial). */
  initial: ReactNode;
};

const iconValues: readonly (ProjectIconKey | null)[] = [null, ...projectIconKeys];

export const ProjectIconPicker = ({
  value,
  onChange,
  color,
  initial,
  className,
  ...aria
}: IconPickerProps) => {
  const { itemProps } = useRovingRadio(iconValues, value, onChange);
  return (
    <div
      role="radiogroup"
      {...aria}
      className={cn("grid grid-cols-9 gap-1 sm:grid-cols-[repeat(13,minmax(0,1fr))]", className)}
    >
      {iconValues.map((key, index) => {
        const checked = key === value;
        const Icon = key ? projectIcons[key] : null;
        return (
          <button
            key={key ?? "initial"}
            {...itemProps(index)}
            aria-checked={checked}
            aria-label={key ?? "Chữ cái đầu"}
            title={key ?? "Chữ cái đầu"}
            onClick={() => onChange(key)}
            className={cn(
              toneClass(color),
              "flex aspect-square items-center justify-center rounded-md text-xs font-semibold text-foreground-muted transition-colors duration-150 outline-none hover:bg-surface-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
              checked &&
                "bg-(--tone-soft) text-(--tone-text) hover:bg-(--tone-soft) hover:text-(--tone-text)"
            )}
          >
            {Icon ? <Icon aria-hidden="true" /> : initial}
          </button>
        );
      })}
    </div>
  );
};
