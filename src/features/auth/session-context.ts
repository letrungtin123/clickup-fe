import { createContext } from "react";

import type { SessionContext } from "@/lib/api/schemas";

/**
 * The session AuthGate resolved, provided to the authenticated subtree. Components read it from
 * context rather than subscribing to the session query, so clearing the cache on sign-out can never
 * re-render a shell component without a session: AuthGate (the provider) re-renders first and
 * unmounts the subtree.
 */
export const SessionValueContext = createContext<SessionContext | null>(null);
