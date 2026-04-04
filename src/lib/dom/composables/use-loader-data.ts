import { computed, type ComputedRef } from "vue";
import { usePageRuntimeState } from "../../runtime/state.ts";
import { useCurrentPageRoute, usePageRoute } from "./use-route.ts";

export function useLoaderData<T = unknown>(routeId?: string): ComputedRef<T | null> {
  const state = usePageRuntimeState();
  const currentPageRoute = useCurrentPageRoute();
  const pageRoute = usePageRoute();

  return computed(() => {
    const resolvedRouteId = routeId ?? currentPageRoute?.id ?? pageRoute.value?.id;
    if (!resolvedRouteId) {
      return null;
    }

    return (state.loaderData[resolvedRouteId] as T | undefined) ?? null;
  });
}

export function useRouteLoaderData<T = unknown>(routeId: string): ComputedRef<T | null> {
  const state = usePageRuntimeState();

  return computed(() => {
    if (!routeId) {
      return null;
    }

    return (state.loaderData[routeId] as T | undefined) ?? null;
  });
}

export function useDeferredData<T = unknown>(key: string, routeId?: string): ComputedRef<T | null> {
  const state = usePageRuntimeState();
  const currentPageRoute = useCurrentPageRoute();
  const pageRoute = usePageRoute();

  return computed(() => {
    const resolvedRouteId = routeId ?? currentPageRoute?.id ?? pageRoute.value?.id;
    if (!resolvedRouteId) {
      return null;
    }

    return (state.deferredData[resolvedRouteId]?.[key] as T | undefined) ?? null;
  });
}

export function useDeferredError<T = unknown>(
  key: string,
  routeId?: string,
): ComputedRef<T | null> {
  const state = usePageRuntimeState();
  const currentPageRoute = useCurrentPageRoute();
  const pageRoute = usePageRoute();

  return computed(() => {
    const resolvedRouteId = routeId ?? currentPageRoute?.id ?? pageRoute.value?.id;
    if (!resolvedRouteId) {
      return null;
    }

    return (state.deferredErrors[resolvedRouteId]?.[key] as T | undefined) ?? null;
  });
}
