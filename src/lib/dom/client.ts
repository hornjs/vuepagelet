import { createSSRApp, defineComponent, h, nextTick, shallowRef, toRaw, type App } from "vue";
import { AppErrorBoundary } from "./components/app-error-boundary.ts";
import { RouterView } from "./components/route-view.ts";
import { initializeClientStateStore, stateStoreKey } from "./composables/use-state.ts";
import { createRouteLocationKey } from "../router/location.ts";
import { pageRuntimeStateKey } from "../runtime/types.ts";
import {
  applyAppState,
  applyDeferredChunk,
  createPageRuntimeState,
  setPendingDeferredKeys,
} from "../runtime/state.ts";
import type { PageRouteRecord } from "../router/types.ts";
import { createPageRouter } from "../router/router.ts";
import { matchPageRoute } from "../router/matcher.ts";
import { deriveRouteErrors } from "../runtime/route-errors.ts";
import { initializeTransition } from "../runtime/transition-manager.ts";
import type { AppModule } from "../runtime/types.ts";

const PAYLOAD_GLOBAL = "__VUEPAGELET__";
const APP_RUNTIME_HMR_GLOBAL = "__APP_RUNTIME_HMR__";
const DOCUMENT_MARKER = "data-vuepagelet";
const ROOT_MARKER = "[data-vuepagelet-root]";
const DOCUMENT_HYDRATION_ERROR = "the vuepagelet runtime requires an app shell that renders a full document with <html>, <head>, and <body>.";

interface DocumentHydrationContainer {
  _vnode?: unknown;
  firstChild: Element | null;
  hasChildNodes(): boolean;
}

interface ClientRuntimeSnapshot {
  appData?: unknown;
  appError?: unknown;
  state?: Record<string, unknown>;
  loaderData?: Record<string, unknown>;
  actionData?: Record<string, unknown>;
  deferredData?: Record<string, Record<string, unknown>>;
  deferredErrors?: Record<string, Record<string, unknown>>;
  pendingDeferredKeys?: Record<string, string[]>;
  routeErrors?: Record<string, unknown>;
}

interface ClientRuntimeGlobal {
  state: ClientRuntimeSnapshot;
  hydrationState?: ClientRuntimeSnapshot;
  subscribe?: (listener: (envelope: unknown) => void) => () => void;
}

interface ClientRuntimeHotUpdatePayload {
  appComponent?: unknown;
  errorComponent?: unknown;
  routes?: PageRouteRecord[];
}

export interface HydratePageOptions {
  routes: PageRouteRecord[];
  app?: AppModule;
}

export interface HydratedPageApp {
  app: App;
  mount(): Promise<void>;
}

export function hydratePage(options: HydratePageOptions): HydratedPageApp {
  const route = matchCurrentRoute(options.routes);
  if (!route) {
    throw new Error("unable to match current location for page hydration");
  }

  const runtime = getClientRuntime();
  const hydrationSnapshot = runtime?.hydrationState ?? runtime?.state;
  const state = createPageRuntimeState(route, options.routes);
  const stateStore = initializeClientStateStore(hydrationSnapshot?.state ?? {});
  const appShell = shallowRef(resolveComponent(options.app?.shell));
  const appErrorComponent = shallowRef(resolveComponent(options.app?.error));
  const hmrVersion = shallowRef(0);
  applyClientSnapshot(state, hydrationSnapshot, {
    includeLoaderData: true,
    includeActionData: true,
  });
  initializeTransition(state, createRouteLocationKey(route));

  const Root = defineComponent({
    name: "HydratedPageRoot",
    setup() {
      return () => {
        const routeTree = h(RouterView, {
          key: hmrVersion.value,
          matches: route.matches,
        });
        const boundaryKey = createRouteLocationKey(state.route);
        const content = h(
          AppErrorBoundary,
          {
            errorComponent: appErrorComponent.value as never,
            externalError: state.appError,
            boundaryKey,
            onCaptureError(errorValue: unknown) {
              state.appError = errorValue;
            },
          },
          {
            default: () => {
              if (!appShell.value) {
                return routeTree;
              }

              return h(appShell.value as never, null, {
                default: () => routeTree,
              });
            },
          },
        );

        return content;
      };
    },
  });

  const app = createSSRApp(Root);
  const router = createPageRouter({
    routes: options.routes,
    state,
  });
  app.use(router);
  app.provide(pageRuntimeStateKey, state);
  app.provide(stateStoreKey, stateStore);

  let unsubscribe: (() => void) | undefined;
  let restoreAppRuntimeHmr: (() => void) | undefined;

  return {
    app,
    async mount() {
      const root = document.querySelector(ROOT_MARKER);
      const container = options.app?.shell
        ? resolveDocumentHydrationContainer()
        : (() => {
            if (!root) {
              throw new Error("unable to find hydration root");
            }

            return root;
          })();

      await router.isReady();
      app.mount(container as string | Element);
      restoreAppRuntimeHmr = installAppRuntimeHotUpdateHook(
        {
          state,
          routes: options.routes,
          appShell,
          appErrorComponent,
          hmrVersion,
        },
        typeof window !== "undefined" ? window : undefined,
      );

      applyDeferredSnapshot(state, runtime?.state);

      if (runtime?.subscribe) {
        unsubscribe = runtime.subscribe((envelope) => {
          const resolved = envelope as {
            type?: string;
            chunk?: {
              routeId: string;
              key: string;
              data?: unknown;
              error?: unknown;
            };
          };

          if (resolved?.type === "deferred" && resolved.chunk) {
            applyDeferredChunk(state, resolved.chunk);
          }
        });
      }

      const originalUnmount = app.unmount.bind(app);
      app.unmount = () => {
        unsubscribe?.();
        unsubscribe = undefined;
        restoreAppRuntimeHmr?.();
        restoreAppRuntimeHmr = undefined;
        originalUnmount();
      };
    },
  };
}

function matchCurrentRoute(routes: PageRouteRecord[]) {
  if (typeof window === "undefined") {
    return null;
  }

  return matchPageRoute(window.location.href, routes);
}

function getClientRuntime(): ClientRuntimeGlobal | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { [PAYLOAD_GLOBAL]?: ClientRuntimeGlobal })[PAYLOAD_GLOBAL];
}

function resolveDocumentHydrationContainer(): DocumentHydrationContainer {
  if (typeof document === "undefined") {
    throw new Error(DOCUMENT_HYDRATION_ERROR);
  }

  if (!document.documentElement.hasAttribute(DOCUMENT_MARKER)) {
    throw new Error(DOCUMENT_HYDRATION_ERROR);
  }

  return {
    firstChild: document.documentElement,
    hasChildNodes() {
      return true;
    },
  };
}

function resolveComponent(component: unknown): unknown {
  return typeof component === "object" && component !== null ? toRaw(component) : component;
}

function installAppRuntimeHotUpdateHook(
  context: {
    state: ReturnType<typeof createPageRuntimeState>;
    routes: PageRouteRecord[];
    appShell: { value: unknown };
    appErrorComponent: { value: unknown };
    hmrVersion: { value: number };
  },
  target: (Window & { [APP_RUNTIME_HMR_GLOBAL]?: unknown }) | undefined,
): () => void {
  if (!target) {
    return () => {};
  }

  const previous = target[APP_RUNTIME_HMR_GLOBAL];
  const applyHotUpdate = async (payload: ClientRuntimeHotUpdatePayload = {}) => {
    if ("appComponent" in payload) {
      context.appShell.value = resolveComponent(payload.appComponent);
    }

    if ("errorComponent" in payload) {
      context.appErrorComponent.value = resolveComponent(payload.errorComponent);
    }

    if (payload.routes) {
      syncHotUpdatedRoutes(context.routes, payload.routes);
      const nextMatch = matchCurrentRoute(context.routes);
      if (nextMatch) {
        context.state.route = nextMatch;
      }
    }

    context.hmrVersion.value += 1;
    await nextTick();
  };

  target[APP_RUNTIME_HMR_GLOBAL] = applyHotUpdate;

  return () => {
    if (previous === undefined) {
      delete target[APP_RUNTIME_HMR_GLOBAL];
      return;
    }

    target[APP_RUNTIME_HMR_GLOBAL] = previous;
  };
}

function syncHotUpdatedRoutes(
  currentRoutes: PageRouteRecord[],
  nextRoutes: PageRouteRecord[],
): void {
  const currentRouteMap = new Map(flattenRoutes(currentRoutes).map((route) => [route.id, route]));

  for (const nextRoute of flattenRoutes(nextRoutes)) {
    const currentRoute = currentRouteMap.get(nextRoute.id);
    if (!currentRoute) {
      continue;
    }

    currentRoute.path = nextRoute.path;
    currentRoute.name = nextRoute.name;
    currentRoute.module = nextRoute.module;
  }
}

function flattenRoutes(routes: PageRouteRecord[]): PageRouteRecord[] {
  return routes.flatMap((route) => [route, ...flattenRoutes(route.children)]);
}

function applyDeferredSnapshot(
  state: ReturnType<typeof createPageRuntimeState>,
  snapshot?: ClientRuntimeSnapshot,
): void {
  applyClientSnapshot(state, snapshot, {
    includeDeferredData: true,
    includeDeferredErrors: true,
  });
}

function applyClientSnapshot(
  state: ReturnType<typeof createPageRuntimeState>,
  snapshot: ClientRuntimeSnapshot | undefined,
  options: {
    includeLoaderData?: boolean;
    includeActionData?: boolean;
    includeDeferredData?: boolean;
    includeDeferredErrors?: boolean;
  } = {},
): void {
  const appSnapshot: {
    appData?: unknown;
    appError?: unknown;
  } = {};
  if (snapshot && "appData" in snapshot) {
    appSnapshot.appData = snapshot.appData;
  }
  if (snapshot && "appError" in snapshot) {
    appSnapshot.appError = snapshot.appError;
  }
  applyAppState(state, appSnapshot);
  setPendingDeferredKeys(state, snapshot?.pendingDeferredKeys ?? {});
  state.routeErrors = deriveRouteErrors(state.route.matches, snapshot);

  if (options.includeLoaderData) {
    state.loaderData = { ...snapshot?.loaderData };
  }

  if (options.includeActionData) {
    state.actionData = { ...snapshot?.actionData };
  }

  if (options.includeDeferredData) {
    state.deferredData = { ...snapshot?.deferredData };
  }

  if (options.includeDeferredErrors) {
    state.deferredErrors = { ...snapshot?.deferredErrors };
  }
}
