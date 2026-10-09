import { cn } from "cn";

/** Muted block with a subtle shimmer sweep (disabled for reduced motion). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.045] before:to-transparent",
        "motion-reduce:before:hidden",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
