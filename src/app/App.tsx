import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { createQueryClient } from "@/lib/query-client";

import { createAppRouter } from "./router";
import { ThemeEffect } from "./ThemeEffect";
import { ViewportSync } from "./ViewportSync";

export const App = () => {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);
  // Phones: toasts drop in from the top so they never cover a composer or the on-screen keyboard.
  const mobile = useBreakpoint() === "mobile";

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <TooltipProvider delay={400}>
          <ThemeEffect />
          <ViewportSync />
          <RouterProvider router={router} />
          <Toaster
            position={mobile ? "top-center" : "bottom-right"}
            mobileOffset={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
            closeButton
          />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
};
