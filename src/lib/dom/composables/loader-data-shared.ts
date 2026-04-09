import { computed, type ComputedRef } from "vue";
import { useCurrentPageRoute, usePageRoute } from "./use-route.ts";

export function resolveRouteRef(routeId?: string): ComputedRef<string | null> {
  const currentPageRoute = useCurrentPageRoute();
  const pageRoute = currentPageRoute ? null : usePageRoute();

  return computed(() => routeId ?? currentPageRoute?.id ?? pageRoute?.value?.id ?? null);
}
