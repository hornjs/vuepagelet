import { computed, type ComputedRef } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";
import { useCurrentPageRoute, usePageRoute } from "./use-route.ts";

export function useActionData<T = unknown>(routeId?: string): ComputedRef<T | null> {
  const state = usePageRuntimeState();
  const currentPageRoute = useCurrentPageRoute();
  const pageRoute = usePageRoute();

  return computed(() => {
    const resolvedRouteId = routeId ?? currentPageRoute?.id ?? pageRoute.value?.id;
    if (!resolvedRouteId) {
      return null;
    }

    return (state.actionData[resolvedRouteId] as T | undefined) ?? null;
  });
}
