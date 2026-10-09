import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useLocation, useNavigate } from "react-router";

import { apiClient } from "../lib/api-client.js";
import { WorkspaceRoute } from "./WorkspaceRoute.js";

export const ProtectedWorkspaceRoute = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => apiClient.getCurrentUser(signal),
    retry: false
  });

  const logoutMutation = useMutation({
    mutationFn: apiClient.logout,
    onSettled: () => {
      queryClient.setQueryData(["auth", "me"], null);
      void navigate("/login", { replace: true });
    }
  });

  if (meQuery.isPending) {
    return (
      <main className="auth-shell">
        <section className="auth-panel compact" aria-label="Trạng thái phiên">
          <div className="auth-brand">
            <div className="brand-mark" aria-hidden="true">
              N
            </div>
            <div>
              <p className="brand-name">Nesso Work</p>
              <p className="brand-subtitle">Đang kiểm tra phiên</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const user = meQuery.data;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <WorkspaceRoute
      isLoggingOut={logoutMutation.isPending}
      onLogout={() => logoutMutation.mutate()}
      user={user}
    />
  );
};
