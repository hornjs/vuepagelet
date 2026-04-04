import { inject, shallowReactive } from "vue";
import { createRouteLocationKey } from "../router/location.ts";
import type { PageRouteMatch, PageRouteRecord } from "../router/types.ts";
import { pageRuntimeStateKey, type PageRuntimeState } from "./types.ts";
import { assignNearestRouteError } from "./route-errors.ts";
import { createTransitionState } from "./transition-manager.ts";

export function createPageRuntimeState(
  route: PageRouteMatch,
  routes: PageRouteRecord[] = route.matches,
): PageRuntimeState {
  return shallowReactive({
    routes,
    route,
    transitionState: createTransitionState(createRouteLocationKey(route)),
    appData: null,
    appError: null,
    loaderData: {},
    actionData: {},
    deferredData: {},
    deferredErrors: {},
    pendingDeferredKeys: {},
    revalidatingRouteIds: [],
    routeErrors: {},
  });
}

export function usePageRuntimeState(): PageRuntimeState {
  const state = inject(pageRuntimeStateKey, null);
  if (!state) {
    throw new Error("page runtime state is not available");
  }

  return state;
}

export function applyDeferredChunk(
  state: PageRuntimeState,
  chunk: {
    routeId: string;
    key: string;
    data?: unknown;
    error?: unknown;
  },
): void {
  removePendingDeferredKey(state, chunk.routeId, chunk.key);

  if (chunk.error !== undefined) {
    state.deferredErrors[chunk.routeId] = {
      ...state.deferredErrors[chunk.routeId],
      [chunk.key]: chunk.error,
    };
    state.routeErrors = assignNearestRouteError({
      routeErrors: state.routeErrors,
      matches: state.route.matches,
      failedRouteId: chunk.routeId,
      error: chunk.error,
    });
    return;
  }

  state.deferredData[chunk.routeId] = {
    ...state.deferredData[chunk.routeId],
    [chunk.key]: chunk.data,
  };
}

export function applyActionData(
  state: PageRuntimeState,
  payload: {
    routeId: string;
    actionData?: unknown;
  },
): void {
  state.actionData = {
    ...state.actionData,
    [payload.routeId]: payload.actionData ?? null,
  };
}

export function applyAppState(
  state: PageRuntimeState,
  payload: {
    appData?: unknown;
    appError?: unknown;
  },
): void {
  if ("appData" in payload) {
    state.appData = payload.appData ?? null;
  }

  if ("appError" in payload) {
    state.appError = payload.appError ?? null;
  }
}

export function setPendingDeferredKeys(
  state: PageRuntimeState,
  pending: Record<string, string[]>,
): void {
  state.pendingDeferredKeys = Object.fromEntries(
    Object.entries(pending).filter(([, keys]) => keys.length > 0),
  );
}

function removePendingDeferredKey(state: PageRuntimeState, routeId: string, key: string): void {
  const existing = state.pendingDeferredKeys[routeId];
  if (!existing || existing.length === 0) {
    return;
  }

  const nextKeys = existing.filter((entry) => entry !== key);
  if (nextKeys.length === existing.length) {
    return;
  }

  const nextPending = { ...state.pendingDeferredKeys };
  if (nextKeys.length === 0) {
    delete nextPending[routeId];
  } else {
    nextPending[routeId] = nextKeys;
  }

  state.pendingDeferredKeys = nextPending;
}
