import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/query-client";

import { createAppRouter } from "./router";
import { ThemeEffect } from "./ThemeEffect";

export const App = () => {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
        <TooltipProvider delay={400}>
          <ThemeEffect />
          <RouterProvider router={router} />
          <Toaster position="bottom-right" closeButton />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
};
