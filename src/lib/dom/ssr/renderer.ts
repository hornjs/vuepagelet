import { renderToString } from "@vue/server-renderer";
import { createSSRApp, defineComponent, h, toRaw } from "vue";
import { createMemoryHistory } from "vue-router";
import { createStateStore, serializeStateStore, stateStoreKey } from "../composables/use-state.ts";
import type { PageRouteMatch, PageRouteRecord } from "../../router/types.ts";
import { createRouteLocationKey } from "../../router/location.ts";
import { matchPageRoute } from "../../router/matcher.ts";
import { createPageRouter } from "../../router/router.ts";
import { pageRuntimeStateKey } from "../../runtime/types.ts";
import { createPageRuntimeState, setPendingDeferredKeys } from "../../runtime/state.ts";
import {
  encodeDeferredChunk,
  iterateResolvedDeferredChunks,
  loadRouteData,
} from "../../runtime/deferred.ts";
import { runWithRouteMiddleware } from "../../runtime/middleware.ts";
import {
  assignNearestRouteError,
  isPageRouteExecutionError,
  PageRouteExecutionError,
} from "../../runtime/route-errors.ts";
import { serializeRuntimeScriptValue } from "../../runtime/serialization.ts";
import { initializeTransition } from "../../runtime/transition-manager.ts";
import type { AppModule } from "../../runtime/types.ts";
import { AppErrorBoundary } from "../components/app-error-boundary.ts";
import { RouterView } from "../components/route-view.ts";
import type { InitialPayload, StreamRenderOptions } from "./types.ts";

const DOCUMENT_MARKER = "data-vuepagelet";
const PAYLOAD_GLOBAL = "__VUEPAGELET__";
const ROOT_MARKER = "data-vuepagelet-root";
const DOCUMENT_SHELL_ERROR =
  "the vuepagelet runtime requires app.shell to render a full document with <html>, <head>, and <body>.";

export async function renderPageResponse(options: StreamRenderOptions): Promise<Response> {
  const matchedRoute = options.route ?? matchPageRoute(options.request.url, options.routes);
  if (!matchedRoute) {
    return new Response("Not Found", { status: 404 });
  }

  return runWithRouteMiddleware(matchedRoute, options.request, "render", async () => {
    try {
      const loaded = await loadRouteData(matchedRoute, options.request);
      if (loaded instanceof Response) {
        return loaded;
      }

      const state = createPageRuntimeState(matchedRoute, options.routes);
      const stateStore = createStateStore();
      const appState = await resolveAppState(options.request, options.app, true);
      state.appData = appState.data;
      state.appError = appState.error;
      state.loaderData = loaded.loaderData;
      state.actionData = { ...options.actionData };
      state.routeErrors = { ...options.routeErrors };
      setPendingDeferredKeys(state, collectPendingDeferredKeys(loaded.pending));
      const html = await renderApplicationToString(
        matchedRoute,
        state,
        stateStore,
        options.app,
        options.routes,
      );
      const payload: InitialPayload = {
        routeId: matchedRoute.route.id,
        appData: state.appData,
        appError: state.appError,
        state: serializeStateStore(stateStore),
        loaderData: state.loaderData,
        actionData: state.actionData,
        pendingDeferredKeys: state.pendingDeferredKeys,
        routeErrors: state.routeErrors,
      };

      const stream = createChunkedDocumentStream(
        html,
        payload,
        loaded.pending,
        options.request.signal,
        options.clientEntryPath,
      );

      return new Response(stream, {
        status:
          options.status ??
          (Object.keys(state.routeErrors).length > 0 || state.appError ? 500 : 200),
        headers: {
          "content-type": "text/html; charset=utf-8",
          "transfer-encoding": "chunked",
        },
      });
    } catch (error) {
      if (!isPageRouteExecutionError(error)) {
        throw error;
      }

      const boundaryErrors = assignNearestRouteError({
        routeErrors: { ...options.routeErrors },
        matches: matchedRoute.matches,
        failedRouteId: error.routeId,
        error: error.error,
      });

      if (Object.keys(boundaryErrors).length === 0) {
        return new Response("Internal Server Error", { status: 500 });
      }

      const state = createPageRuntimeState(matchedRoute, options.routes);
      const stateStore = createStateStore();
      const appState = await resolveAppState(options.request, options.app, true);
      state.appData = appState.data;
      state.appError = appState.error;
      state.loaderData = { ...error.loaderData };
      state.actionData = { ...options.actionData };
      state.routeErrors = boundaryErrors;
      setPendingDeferredKeys(state, collectPendingDeferredKeys(error.pending ?? []));
      const html = await renderApplicationToString(
        matchedRoute,
        state,
        stateStore,
        options.app,
        options.routes,
      );
      const payload: InitialPayload = {
        routeId: matchedRoute.route.id,
        appData: state.appData,
        appError: state.appError,
        state: serializeStateStore(stateStore),
        loaderData: state.loaderData,
        actionData: state.actionData,
        pendingDeferredKeys: state.pendingDeferredKeys,
        routeErrors: state.routeErrors,
      };

      return new Response(injectBootstrapPayload(html, payload, options.clientEntryPath), {
        status: options.status ?? 500,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }
  });
}

async function renderApplicationToString(
  route: PageRouteMatch,
  state: ReturnType<typeof createPageRuntimeState>,
  stateStore: ReturnType<typeof createStateStore>,
  appModule?: AppModule,
  routes?: PageRouteRecord[],
  attempt = 0,
): Promise<string> {
  const Root = defineComponent({
    name: "PageRendererRoot",
    setup() {
      return () => {
        const routeTree = h(RouterView, {
          matches: route.matches,
        });
        const component = resolveAppComponent(appModule?.shell);
        const appErrorComponent = resolveAppComponent(appModule?.error);
        const boundaryKey = createRouteLocationKey(route);
        const subject = h(
          AppErrorBoundary,
          {
            errorComponent: appErrorComponent as never,
            externalError: state.appError,
            boundaryKey,
            onCaptureError(errorValue: unknown) {
              state.appError = errorValue;
            },
          },
          {
            default: () => {
              if (!component) {
                return routeTree;
              }

              return h(component as never, null, {
                default: () => routeTree,
              });
            },
          },
        );

        return subject;
      };
    },
  });

  const app = createSSRApp(Root);
  const initialRouteErrorCount = Object.keys(state.routeErrors).length;
  const initialAppError = state.appError;
  initializeTransition(state, createRouteLocationKey(route));
  const router = createPageRouter({
    routes: routes ?? state.routes,
    state,
    history: createMemoryHistory(),
  });
  await router.push(route.pathname);
  await router.isReady();
  app.use(router);
  app.provide(pageRuntimeStateKey, state);
  app.provide(stateStoreKey, stateStore);
  let capturedError: unknown;
  let capturedRouteId: string | undefined;

  app.config.errorHandler = (error, instance) => {
    capturedError = error;
    if (!capturedRouteId) {
      capturedRouteId = resolveRenderErrorRouteId(
        route.matches,
        (instance as { $?: { type?: unknown } } | undefined)?.$?.type,
      );
    }
  };

  try {
    const rendered = await renderToString(app);
    if (
      (Object.keys(state.routeErrors).length > initialRouteErrorCount ||
        state.appError !== initialAppError) &&
      attempt === 0
    ) {
      return renderApplicationToString(route, state, stateStore, appModule, routes, attempt + 1);
    }

    if (capturedError) {
      throw new PageRouteExecutionError({
        phase: "render",
        routeId: capturedRouteId ?? route.route.id,
        error: capturedError,
        loaderData: state.loaderData,
      });
    }

    if (appModule?.shell) {
      if (!isDocumentShellHtml(rendered)) {
        throw new Error(DOCUMENT_SHELL_ERROR);
      }

      return ensureDocumentMarker(rendered);
    }

    return `<!DOCTYPE html><html ${DOCUMENT_MARKER}><head></head><body><div ${ROOT_MARKER}>${rendered}</div></body></html>`;
  } catch (error) {
    if (isPageRouteExecutionError(error)) {
      throw error;
    }

    throw new PageRouteExecutionError({
      phase: "render",
      routeId: capturedRouteId ?? route.route.id,
      error: capturedError ?? error,
      loaderData: state.loaderData,
    });
  }
}

function createChunkedDocumentStream(
  html: string,
  payload: InitialPayload,
  pending: Array<{
    routeId: string;
    key: string;
    promise: Promise<{
      routeId: string;
      key: string;
      data?: unknown;
      error?: unknown;
    }>;
  }>,
  signal?: AbortSignal,
  clientEntryPath?: string,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encodeText(injectBootstrapPayload(html, payload, clientEntryPath)));

      for await (const resolved of iterateResolvedDeferredChunks(pending, signal)) {
        controller.enqueue(encodeText(createDeferredPatchScript(resolved)));
      }

      controller.close();
    },
  });
}

function injectBootstrapPayload(
  html: string,
  payload: InitialPayload,
  clientEntryPath?: string,
): string {
  const script = [
    "<script>",
    "var __VUE_OPTIONS_API__=true;",
    "var __VUE_PROD_DEVTOOLS__=false;",
    "var __VUE_PROD_HYDRATION_MISMATCH_DETAILS__=false;",
    `window.${PAYLOAD_GLOBAL}=window.${PAYLOAD_GLOBAL}||createPageRendererRuntime();`,
    `window.${PAYLOAD_GLOBAL}.bootstrap(${serializeRuntimeScriptValue(payload)});`,
    `${createRuntimeFactoryScript()}`,
    "</script>",
  ].join("");

  const clientEntry = clientEntryPath
    ? `<script type="module" src="${escapeHtml(clientEntryPath)}"></script>`
    : "";

  return html.includes("</body>")
    ? html.replace("</body>", `${script}${clientEntry}</body>`)
    : `${html}${script}${clientEntry}`;
}

function createDeferredPatchScript(chunk: {
  routeId: string;
  key: string;
  data?: unknown;
  error?: unknown;
}): string {
  return `<script>window.${PAYLOAD_GLOBAL}.resolve(${serializeRuntimeScriptValue(encodeDeferredChunk(chunk))});</script>`;
}

function createRuntimeFactoryScript(): string {
  return `function createPageRendererRuntime(){return{state:{appData:null,appError:null,state:{},loaderData:{},actionData:{},deferredData:{},deferredErrors:{},pendingDeferredKeys:{},routeErrors:{}},hydrationState:{appData:null,appError:null,state:{},loaderData:{},actionData:{},deferredData:{},deferredErrors:{},pendingDeferredKeys:{},routeErrors:{}},listeners:new Set(),bootstrap(payload){this.state.appData=payload.appData??null;this.state.appError=payload.appError??null;this.state.state=payload.state||{};this.state.loaderData=payload.loaderData||{};this.state.actionData=payload.actionData||{};this.state.pendingDeferredKeys=payload.pendingDeferredKeys||{};this.state.routeErrors=payload.routeErrors||{};this.hydrationState={appData:this.state.appData,appError:this.state.appError,state:Object.assign({},this.state.state),loaderData:Object.assign({},this.state.loaderData),actionData:Object.assign({},this.state.actionData),deferredData:{},deferredErrors:{},pendingDeferredKeys:Object.assign({},this.state.pendingDeferredKeys),routeErrors:Object.assign({},this.state.routeErrors)};},subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);},resolve(envelope){if(!envelope||envelope.type!=="deferred"){return;}const chunk=envelope.chunk;const target=chunk.error!==undefined?"deferredErrors":"deferredData";if(this.state.pendingDeferredKeys&&this.state.pendingDeferredKeys[chunk.routeId]){this.state.pendingDeferredKeys[chunk.routeId]=this.state.pendingDeferredKeys[chunk.routeId].filter(function(entry){return entry!==chunk.key;});if(this.state.pendingDeferredKeys[chunk.routeId].length===0){delete this.state.pendingDeferredKeys[chunk.routeId];}}this.state[target][chunk.routeId]=Object.assign({},this.state[target][chunk.routeId],{[chunk.key]:chunk.error!==undefined?chunk.error:chunk.data});this.listeners.forEach((listener)=>listener(envelope));}}}`;
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeHtml(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function collectPendingDeferredKeys(
  pending: Array<{
    routeId: string;
    key: string;
  }>,
): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};

  for (const chunk of pending) {
    grouped[chunk.routeId] = [...(grouped[chunk.routeId] ?? []), chunk.key];
  }

  return grouped;
}

function resolveAppComponent(component: unknown): unknown {
  return typeof component === "object" && component !== null ? toRaw(component) : component;
}

async function resolveAppState(
  request: Request,
  app?: AppModule,
  shouldRevalidate = true,
): Promise<{ data: unknown; error: unknown }> {
  if (!app?.loader || !shouldRevalidate) {
    return {
      data: null,
      error: null,
    };
  }

  try {
    return {
      data: await app.loader(request),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error,
    };
  }
}

function isDocumentShellHtml(html: string): boolean {
  return /<html[\s>]/i.test(html) && /<head[\s>]/i.test(html) && /<body[\s>]/i.test(html);
}

function ensureDocumentMarker(html: string): string {
  if (new RegExp(`\\s${DOCUMENT_MARKER}(?:=(["']).*?\\1)?`, "i").test(html)) {
    return html;
  }

  return html.replace(/<html\b/i, `<html ${DOCUMENT_MARKER}`);
}

function resolveRenderErrorRouteId(
  matches: PageRouteRecord[],
  componentType: unknown,
): string | undefined {
  const normalizedComponent = resolveAppComponent(componentType);
  if (normalizedComponent === undefined) {
    return matches[matches.length - 1]?.id;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const route = matches[index];
    if (resolveAppComponent(route.module.component) === normalizedComponent) {
      return route.id;
    }

    if (resolveAppComponent(route.module.error) === normalizedComponent) {
      return route.id;
    }

    if (resolveAppComponent(route.module.loading) === normalizedComponent) {
      return route.id;
    }

    if (resolveAppComponent(route.module.layout) === normalizedComponent) {
      return matches[index - 1]?.id ?? route.id;
    }
  }

  return matches[matches.length - 1]?.id;
}
