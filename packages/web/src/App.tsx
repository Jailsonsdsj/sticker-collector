import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RouterProvider } from "react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ApiError } from "./lib/api";
import { CompletionQueueProvider } from "./lib/completionQueue";
import { useCompleteOccurrence } from "./lib/mutations";
import { useMe } from "./lib/timezone";
import { router } from "./routes/router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a 401 or a 400 just delays the error the user needs to see.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.status < 500 ? false : failureCount < 2,
      staleTime: 30_000,
    },
  },
});

/**
 * The undo queue sits above the router on purpose: moving between tabs during
 * the window must not drop a pending completion, and unmounting the router
 * would take the timers with it.
 */
/**
 * Adopts the profile's timezone before anything asks what day it is.
 *
 * Mounted above the router so one fetch serves every screen. Until it answers,
 * the device's zone stands in — which is what the whole app used to do, and is
 * still the right fallback for a first paint with no network.
 */
function Timezone({ children }: { children: ReactNode }) {
  useMe();
  return <>{children}</>;
}

function CompletionQueue({ children }: { children: ReactNode }) {
  const complete = useCompleteOccurrence();
  return (
    <CompletionQueueProvider onCommit={(ref) => complete.mutateAsync(ref)}>
      {children}
    </CompletionQueueProvider>
  );
}

/**
 * Two boundaries, not one.
 *
 * `AppShell` holds the inner one, which keeps the tab bar alive when a screen
 * crashes. This outer one covers what sits *above* the router: the query client
 * and the undo queue.
 *
 * It deliberately does **not** cover route crashes, and could not if it wanted
 * to — React Router installs a default boundary on every route and catches
 * those first. `RouteCrash`, wired as `errorElement`, is what handles them.
 */
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Timezone>
          <CompletionQueue>
            <RouterProvider router={router} />
          </CompletionQueue>
        </Timezone>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
