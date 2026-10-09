import { cn } from "cn";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { modKeyLabel } from "@/lib/keyboard";

/**
 * Keyboard shortcut hint, e.g. <Shortcut keys={["mod", "K"]} />. Hidden on touch-only devices,
 * where there is no keyboard to press it on.
 */
export const Shortcut = ({ keys, className }: { keys: readonly string[]; className?: string }) => (
  <KbdGroup className={cn("pointer-coarse:hidden", className)}>
    {keys.map((key) => (
      <Kbd key={key}>{key === "mod" ? modKeyLabel() : key}</Kbd>
    ))}
  </KbdGroup>
);
