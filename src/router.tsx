import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // react-query's own defaults (refetchOnWindowFocus/refetchOnReconnect:
  // true) refire every active query whenever the tab regains focus or the
  // network reconnects — on mobile, switching apps and back does this
  // constantly, which reads as "the app keeps refreshing itself" even though
  // nothing actually reloaded. Queries that do want periodic freshness
  // already set their own explicit refetchInterval (useUniversalAccount.ts,
  // useDelegationStatus.ts) — that's a deliberate, visible choice per query,
  // not a blanket background behavior every query inherits by default.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
