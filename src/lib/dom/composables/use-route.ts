import { computed, inject, type ComputedRef, type InjectionKey } from "vue";
import { useRoute as useVueRoute, useRouter as useVueRouter } from "vue-router";
import { resolvePageRouteRecord } from "../../router/router.ts";
import type { PageRouteLocation, PageRouteRecord } from "../../router/types.ts";
import { usePageRuntimeState } from "../../runtime/state.ts";

export const currentRouteRecordKey: InjectionKey<PageRouteRecord> = Symbol("current-route-record");

export function useRoute(): ComputedRef<PageRouteLocation> {
  const state = usePageRuntimeState();
  const nativeRoute = useVueRoute();

  return computed(() => {
    const resolvedRoute = resolvePageRouteRecord(nativeRoute);
    const matched = nativeRoute.matched
      .map((record) => record.meta?.pageRouteRecord)
      .filter((record): record is PageRouteRecord => isPageRouteRecord(record));

    return {
      path: nativeRoute.path,
      fullPath: nativeRoute.fullPath,
      params: Object.fromEntries(
        Object.entries(nativeRoute.params).map(([key, value]) => [key, normalizeRouteParam(value)]),
      ),
      query: Object.fromEntries(
        Object.entries(nativeRoute.query).map(([key, value]) => [
          key,
          normalizeRouteQueryValue(value),
        ]),
      ),
      hash: nativeRoute.hash,
      matched: matched.length > 0 ? matched : state.route.matches,
      route: resolvedRoute ?? state.route.route,
      native: nativeRoute,
    };
  });
}

export function useCurrentPageRoute(): PageRouteRecord | null {
  return inject(currentRouteRecordKey, null);
}

export function usePageRoute(): ComputedRef<PageRouteRecord | null> {
  const route = useRoute();
  const currentPageRoute = useCurrentPageRoute();

  return computed(() => currentPageRoute ?? route.value.route);
}

export function useRouter() {
  return useVueRouter();
}

function normalizeRouteParam(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "")).join("/");
  }

  return String(value ?? "");
}

function normalizeRouteQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[value.length - 1] ?? "");
  }

  return String(value ?? "");
}

function isPageRouteRecord(value: unknown): value is PageRouteRecord {
  return typeof value === "object" && value !== null && "id" in value && "module" in value;
}
