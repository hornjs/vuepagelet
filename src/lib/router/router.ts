import {
  createMemoryHistory,
  createRouter as createVueRouter,
  createWebHistory,
  RouterView,
  type RouteLocationNormalizedLoaded,
  type Router,
  type RouterHistory,
} from "vue-router";
import { computed, defineComponent, h, onErrorCaptured, provide, ref, watch } from "vue";
import { createRouteLocationKey } from "./location.ts";
import { createVuePageRouteRecords, matchPageRoute } from "./matcher.ts";
import type { PageRouteRecord, PageRouteTo } from "./types.ts";
import { currentRouteRecordKey } from "../dom/composables/use-route.ts";
import { pruneRouteStateMaps } from "../runtime/route-state.ts";
import { applyAppState, applyDeferredChunk, usePageRuntimeState } from "../runtime/state.ts";
import { createRevalidationPlan } from "../runtime/revalidation.ts";
import { assignNearestRouteError, clearMatchedRouteErrors } from "../runtime/route-errors.ts";
import { parseRuntimePayload } from "../runtime/serialization.ts";
import type {
  DeferredChunkEnvelope,
  NavigationPayloadEnvelope,
  NavigationSubmissionPayload,
  PageRuntimeState,
} from "../runtime/types.ts";
import {
  finishLoading,
  finishNavigation,
  startLoading,
  startNavigation,
} from "../runtime/transition-manager.ts";

const PAGE_ROUTE_META_KEY = "pageRouteRecord";

export interface CreatePageRouterOptions {
  routes: PageRouteRecord[];
  state?: PageRuntimeState;
  history?: RouterHistory;
  base?: string;
  fetcher?: typeof fetch;
}

export interface PageRouter {
  push(to: PageRouteTo): ReturnType<Router["push"]>;
  replace(to: PageRouteTo): ReturnType<Router["replace"]>;
  resolve(to: PageRouteTo): ReturnType<Router["resolve"]>;
  back(): ReturnType<Router["back"]>;
  forward(): ReturnType<Router["forward"]>;
  go(delta: number): ReturnType<Router["go"]>;
  install: Router["install"];
  currentRoute: Router["currentRoute"];
  beforeEach: Router["beforeEach"];
  beforeResolve: Router["beforeResolve"];
  afterEach: Router["afterEach"];
  onError: Router["onError"];
  isReady: Router["isReady"];
}

export function createPageRouter(options: CreatePageRouterOptions): PageRouter {
  const history =
    options.history ??
    (typeof window === "undefined"
      ? createMemoryHistory(options.base)
      : createWebHistory(options.base));
  const router = createVueRouter({
    history,
    routes: createVuePageRouteRecords(options.routes),
  });

  instrumentRouter(router, options.routes, options.state, options.fetcher);
  return router as unknown as PageRouter;
}

export function createPageRouteComponent(route: PageRouteRecord) {
  return defineComponent({
    name: `PageRouteComponent:${route.id}`,
    setup() {
      provide(currentRouteRecordKey, route);
      const state = usePageRuntimeState();
      const renderError = ref<unknown>(null);
      const hasPendingDeferred = computed(
        () => (state.pendingDeferredKeys[route.id]?.length ?? 0) > 0,
      );
      const isRevalidating = computed(() => state.revalidatingRouteIds.includes(route.id));
      const routeError = computed(() => state.routeErrors[route.id] ?? null);
      const boundaryKey = computed(() => createRouteLocationKey(state.route));

      watch(boundaryKey, () => {
        renderError.value = null;
      });

      return () => {
        const component = route.module.component;
        const layout = route.module.layout;
        const loading = route.module.loading;
        const error = route.module.error;
        const subject = resolveRouteSubject({
          route,
          component,
          loading,
          hasPendingDeferred: hasPendingDeferred.value,
          isRevalidating: isRevalidating.value,
        });
        const content = error
          ? h(
              PageRouteErrorBoundary,
              {
                errorComponent: error,
                externalError: renderError.value ?? routeError.value,
                route,
                boundaryKey: boundaryKey.value,
                onCaptureError(errorValue: unknown) {
                  renderError.value = errorValue;
                  state.routeErrors = assignNearestRouteError({
                    routeErrors: state.routeErrors,
                    matches: state.route.matches,
                    failedRouteId: route.id,
                    error: errorValue,
                  });
                },
              },
              {
                default: () => subject,
              },
            )
          : subject;

        if (!layout) {
          return content;
        }

        return h(layout as never, null, {
          default: () => content,
        });
      };
    },
  });
}

export function createPageRouteMeta(route: PageRouteRecord): Record<string, unknown> {
  return {
    [PAGE_ROUTE_META_KEY]: route,
  };
}

export function resolvePageRouteRecord(
  route: RouteLocationNormalizedLoaded,
): PageRouteRecord | null {
  for (let index = route.matched.length - 1; index >= 0; index -= 1) {
    const value = route.matched[index]?.meta?.[PAGE_ROUTE_META_KEY];
    if (isPageRouteRecord(value)) {
      return value;
    }
  }

  return null;
}

function instrumentRouter(
  router: Router,
  routes: PageRouteRecord[],
  state?: PageRuntimeState,
  fetcher?: typeof fetch,
): void {
  const browserFetcher =
    fetcher ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  let hasHandledInitialNavigation = false;
  let activeRefreshController: AbortController | null = null;
  let activeRefreshToken = 0;

  const originalPush = router.push.bind(router);
  const originalReplace = router.replace.bind(router);

  router.push = async (...args) => {
    const resolved = router.resolve(args[0]);
    beginNavigation(state, resolved.fullPath, "push");

    try {
      return await originalPush(...args);
    } finally {
      finishNavigation(state);
    }
  };

  router.replace = async (...args) => {
    const resolved = router.resolve(args[0]);
    beginNavigation(state, resolved.fullPath, "replace");

    try {
      return await originalReplace(...args);
    } finally {
      finishNavigation(state);
    }
  };

  router.afterEach((to, _from, failure) => {
    if (failure || !state || !browserFetcher || typeof window === "undefined") {
      return;
    }

    const currentMatch = state.route;
    const previousUrl = createNavigationReferer(currentMatch);
    const match = matchPageRoute(window.location.href, routes);
    if (match) {
      state.route = match;
    } else {
      state.revalidatingRouteIds = [];
    }

    if (!hasHandledInitialNavigation) {
      hasHandledInitialNavigation = true;
      state.revalidatingRouteIds = [];
      return;
    }

    if (match) {
      const plan = createRevalidationPlan({
        currentMatch,
        nextMatch: match,
        currentUrl: previousUrl ? new URL(previousUrl) : null,
        nextUrl: new URL(window.location.href),
      });
      state.revalidatingRouteIds = plan.routeIds;
      clearRevalidatingRouteState(state, plan.routeIds);
    }

    activeRefreshController?.abort();
    activeRefreshController = typeof AbortController === "undefined" ? null : new AbortController();
    activeRefreshToken += 1;
    const refreshToken = activeRefreshToken;

    void refreshRouteData(to.fullPath, browserFetcher, state, previousUrl, {
      signal: activeRefreshController?.signal,
      isCurrent() {
        return refreshToken === activeRefreshToken;
      },
    }).finally(() => {
      if (refreshToken === activeRefreshToken) {
        activeRefreshController = null;
      }
    });
  });

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      const location = window.location.pathname + window.location.search + window.location.hash;
      beginNavigation(state, location, "pop");
    });
  }
}

async function refreshRouteData(
  target: string,
  fetcher: typeof fetch,
  state: PageRuntimeState,
  previousUrl?: string,
  options?: {
    signal?: AbortSignal;
    isCurrent?: () => boolean;
  },
): Promise<void> {
  const isCurrent = options?.isCurrent ?? (() => true);
  startLoading(state, target);

  try {
    const requestInit: RequestInit = {
      headers: {
        accept: "application/json",
      },
      signal: options?.signal,
    };

    if (previousUrl) {
      requestInit.referrer = previousUrl;
    }

    const response = await fetcher(target, requestInit);
    if (!isCurrent()) {
      return;
    }
    const nextLoaderData = { ...state.loaderData };
    const nextDeferredData = { ...state.deferredData };
    const nextDeferredErrors = { ...state.deferredErrors };
    const nextPendingDeferredKeys = { ...state.pendingDeferredKeys };
    const nextRouteErrors = clearMatchedRouteErrors(state.routeErrors, state.route.matches);
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/x-ndjson") && response.body) {
      await consumeNavigationStream(
        response.body,
        (envelope) => {
          if (!isCurrent()) {
            return;
          }

          if (envelope.type === "navigation") {
            applyNavigationPayload(state, envelope.payload, {
              nextLoaderData,
              nextDeferredData,
              nextDeferredErrors,
              nextPendingDeferredKeys,
              nextRouteErrors,
            });
            return;
          }

          if (envelope.type === "deferred") {
            applyDeferredChunk(state, envelope.chunk);
          }
        },
        {
          signal: options?.signal,
          shouldContinue: isCurrent,
        },
      );
      return;
    }

    if (!isCurrent()) {
      return;
    }

    const payload = parseRuntimePayload<NavigationSubmissionPayload>(await response.text());
    if (!isCurrent()) {
      return;
    }
    applyNavigationPayload(state, payload, {
      nextLoaderData,
      nextDeferredData,
      nextDeferredErrors,
      nextPendingDeferredKeys,
      nextRouteErrors,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }

    throw error;
  } finally {
    if (isCurrent()) {
      state.revalidatingRouteIds = [];
      finishLoading(state);
    }
  }
}

function isPageRouteRecord(value: unknown): value is PageRouteRecord {
  return typeof value === "object" && value !== null && "id" in value && "module" in value;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError",
  );
}

function createNavigationReferer(route: PageRuntimeState["route"]): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return new URL(createRouteLocationKey(route), window.location.origin).href;
}

function resolveRouteSubject(options: {
  route: PageRouteRecord;
  component: PageRouteRecord["module"]["component"];
  loading: PageRouteRecord["module"]["loading"];
  hasPendingDeferred: boolean;
  isRevalidating: boolean;
}) {
  if ((options.hasPendingDeferred || options.isRevalidating) && options.loading) {
    return h(options.loading as never);
  }

  if (!options.component) {
    return h(RouterView);
  }

  return h(options.component as never, null, {
    default: () => h(RouterView),
  });
}

function beginNavigation(
  state: PageRuntimeState | undefined,
  location: string,
  action: "push" | "replace" | "pop",
): void {
  if (state) {
    startNavigation(state, location, action);
    return;
  }

  startNavigation(location, action);
}

function clearRevalidatingRouteState(state: PageRuntimeState, routeIds: string[]): void {
  if (routeIds.length === 0) {
    return;
  }

  const nextState = pruneRouteStateMaps(routeIds, {
    loaderData: state.loaderData,
    actionData: state.actionData,
    deferredData: state.deferredData,
    deferredErrors: state.deferredErrors,
    pendingDeferredKeys: state.pendingDeferredKeys,
    routeErrors: state.routeErrors,
  });

  state.loaderData = nextState.loaderData ?? {};
  state.actionData = nextState.actionData ?? {};
  state.deferredData = nextState.deferredData ?? {};
  state.deferredErrors = nextState.deferredErrors ?? {};
  state.pendingDeferredKeys = nextState.pendingDeferredKeys ?? {};
  state.routeErrors = nextState.routeErrors ?? {};
}

function applyNavigationPayload(
  state: PageRuntimeState,
  payload: NavigationSubmissionPayload,
  cache: {
    nextLoaderData: Record<string, unknown>;
    nextDeferredData: Record<string, Record<string, unknown>>;
    nextDeferredErrors: Record<string, Record<string, unknown>>;
    nextPendingDeferredKeys: Record<string, string[]>;
    nextRouteErrors: Record<string, unknown>;
  },
): void {
  applyAppState(state, payload);
  state.revalidatingRouteIds = [];
  const nextState = pruneRouteStateMaps(payload.revalidatedRouteIds ?? [], {
    deferredData: cache.nextDeferredData,
    deferredErrors: cache.nextDeferredErrors,
    pendingDeferredKeys: cache.nextPendingDeferredKeys,
    routeErrors: cache.nextRouteErrors,
  });

  state.loaderData = {
    ...cache.nextLoaderData,
    ...payload.loaderData,
  };
  state.actionData = {};
  state.deferredData = {
    ...nextState.deferredData,
    ...payload.deferredData,
  };
  state.deferredErrors = nextState.deferredErrors ?? {};
  state.pendingDeferredKeys = {
    ...nextState.pendingDeferredKeys,
    ...payload.pendingDeferredKeys,
  };
  state.routeErrors = {
    ...nextState.routeErrors,
    ...payload.routeErrors,
  };
}

async function consumeNavigationStream(
  body: ReadableStream<Uint8Array>,
  onEnvelope: (envelope: NavigationPayloadEnvelope | DeferredChunkEnvelope) => void,
  options?: {
    signal?: AbortSignal;
    shouldContinue?: () => boolean;
  },
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const cancelReader = async () => {
    try {
      await reader.cancel();
    } catch {
      // ignore stream teardown errors
    }
  };

  try {
    while (true) {
      if (options?.signal?.aborted || (options?.shouldContinue && !options.shouldContinue())) {
        await cancelReader();
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = flushNavigationBuffer(buffer, onEnvelope);

      if (options?.signal?.aborted || (options?.shouldContinue && !options.shouldContinue())) {
        await cancelReader();
        break;
      }
    }

    buffer += decoder.decode();
    flushNavigationBuffer(buffer, onEnvelope);
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }
  } finally {
    reader.releaseLock();
  }
}

function flushNavigationBuffer(
  buffer: string,
  onEnvelope: (envelope: NavigationPayloadEnvelope | DeferredChunkEnvelope) => void,
): string {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    onEnvelope(parseRuntimePayload<NavigationPayloadEnvelope | DeferredChunkEnvelope>(line));
  }

  return remainder;
}

const PageRouteErrorBoundary = defineComponent({
  name: "PageRouteErrorBoundary",
  props: {
    errorComponent: {
      type: [Object, Function],
      required: true,
    },
    externalError: {
      type: null,
      default: null,
    },
    route: {
      type: Object,
      required: true,
    },
    boundaryKey: {
      type: String,
      required: true,
    },
    onCaptureError: {
      type: Function,
      default: null,
    },
  },
  setup(props, { slots }) {
    const capturedError = ref<unknown>(null);

    watch(
      () => props.boundaryKey,
      () => {
        capturedError.value = null;
      },
    );

    onErrorCaptured((errorValue) => {
      capturedError.value = errorValue;
      props.onCaptureError?.(errorValue);
      return false;
    });

    return () => {
      const activeError = props.externalError ?? capturedError.value;
      if (activeError) {
        return h(props.errorComponent as never, {
          error: activeError,
        });
      }

      return slots.default ? slots.default() : null;
    };
  },
});
