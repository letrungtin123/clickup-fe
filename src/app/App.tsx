import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router";

import { LoginRoute } from "../routes/LoginRoute.js";
import { ProtectedWorkspaceRoute } from "../routes/ProtectedWorkspaceRoute.js";
import { ThemeEffect } from "./ThemeEffect.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false
    }
  }
});

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginRoute />
  },
  {
    path: "/",
    element: <ProtectedWorkspaceRoute />
  }
]);

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeEffect />
    <RouterProvider router={router} />
  </QueryClientProvider>
);
