import { Navigate, useLocation } from "react-router";

import { InboxPage } from "@/features/notifications/components/inbox-page";

/** `/inbox` — notifications (Tất cả / Chưa đọc / Nhắc đến). */
export const InboxRoute = () => <InboxPage />;

/** `/notifications` (the SPEC Phase 4 name) is the inbox: keep the query (?tab=) and go there. */
export const NotificationsRedirectRoute = () => {
  const { search } = useLocation();
  return <Navigate to={`/inbox${search}`} replace />;
};
