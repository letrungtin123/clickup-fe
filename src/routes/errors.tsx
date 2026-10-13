import { Compass, Home, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { Link } from "@/components/shared/router-link";

import { EmptyState, ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api/errors";

export const NotFoundRoute = () => (
  <div className="flex h-full items-center justify-center p-4">
    <EmptyState
      icon={Compass}
      title="Không tìm thấy trang"
      description="Đường dẫn có thể đã thay đổi, hoặc bạn không còn quyền truy cập nội dung này."
      action={
        <Button render={<Link to="/" />} nativeButton={false} variant="outline">
          <Home />
          Về trang chủ
        </Button>
      }
    />
  </div>
);

const isChunkLoadError = (error: unknown) =>
  error instanceof Error &&
  /Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    error.message
  );

/** Route-level error boundary: keeps the shell (sidebar) usable and never shows raw internals. */
export const RouteErrorBoundary = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundRoute />;
  }

  if (isChunkLoadError(error)) {
    // A new deployment replaced the chunk this tab expected.
    return (
      <div className="flex h-full items-center justify-center p-4">
        <EmptyState
          icon={RefreshCw}
          title="Đã có phiên bản mới"
          description="Tải lại trang để dùng phiên bản mới nhất."
          action={
            <Button onClick={() => window.location.reload()}>
              <RefreshCw />
              Tải lại
            </Button>
          }
        />
      </div>
    );
  }

  if (import.meta.env.DEV && !isApiError(error)) {
    console.error(error);
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <ErrorState
        error={error}
        title="Đã có lỗi khi hiển thị trang này"
        onRetry={() => window.location.reload()}
      />
    </div>
  );
};
