import { computed, type ComputedRef } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";

export function useRouteLoaderData<T = unknown>(routeId: string): ComputedRef<T | null> {
  const state = usePageRuntimeState();

  return computed(() => {
    if (!routeId) {
      return null;
    }

    return (state.loaderData[routeId] as T | undefined) ?? null;
  });
}
