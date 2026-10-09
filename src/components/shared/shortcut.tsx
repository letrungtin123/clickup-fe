import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { modKeyLabel } from "@/lib/keyboard";

/** Keyboard shortcut hint, e.g. <Shortcut keys={["mod", "K"]} />. */
export const Shortcut = ({ keys, className }: { keys: readonly string[]; className?: string }) => (
  <KbdGroup className={className}>
    {keys.map((key) => (
      <Kbd key={key}>{key === "mod" ? modKeyLabel() : key}</Kbd>
    ))}
  </KbdGroup>
);
