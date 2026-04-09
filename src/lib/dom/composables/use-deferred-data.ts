import { computed, type ComputedRef } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";
import { resolveRouteRef } from "./loader-data-shared.ts";

export function useDeferredData<T = unknown>(key: string, routeId?: string): ComputedRef<T | null> {
  const state = usePageRuntimeState();
  const resolvedRoute = resolveRouteRef(routeId);

  return computed(() => {
    if (!resolvedRoute.value) {
      return null;
    }

    return (state.deferredData[resolvedRoute.value]?.[key] as T | undefined) ?? null;
  });
}
