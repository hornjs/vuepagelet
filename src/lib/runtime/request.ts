import { renderPageResponse } from "../dom/ssr/renderer.ts";
import { matchPageRoute } from "../router/matcher.ts";
import type { PageRouteRecord } from "../router/types.ts";
import { executeActionForMatch } from "./action.ts";
import {
  collectResolvedDeferredChunks,
  encodeDeferredChunk,
  iterateResolvedDeferredChunks,
  loadRouteData,
} from "./deferred.ts";
import { runWithRouteMiddleware } from "./middleware.ts";
import { createAppRevalidationPlan, createRevalidationPlan } from "./revalidation.ts";
import { assignNearestRouteError, isPageRouteExecutionError } from "./route-errors.ts";
import { stringifyRuntimePayload } from "./serialization.ts";
import type {
  AppModule,
  ActionSubmissionPayload,
  NavigationPayloadEnvelope,
  NavigationSubmissionPayload,
  PendingDeferredChunk,
} from "./types.ts";

export interface PageRequestHandlerOptions {
  routes: PageRouteRecord[];
  app?: AppModule;
  clientEntryPath?: string;
}

export async function handlePageRequest(
  request: Request,
  options: PageRequestHandlerOptions,
): Promise<Response> {
  const match = matchPageRoute(request.url, options.routes);
  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  if (isNavigationDataRequest(request)) {
    return createNavigationDataResponse(request, match, options.routes, options.app);
  }

  if (isActionMethod(request.method)) {
    let actionResult: Awaited<ReturnType<typeof executeActionForMatch>> | Response;

    try {
      actionResult = await runWithRouteMiddleware(match, request, "action", async () =>
        executeActionForMatch(request, match),
      );
    } catch (error) {
      const routeErrors = assignNearestRouteError({
        routeErrors: {},
        matches: match.matches,
        failedRouteId: isPageRouteExecutionError(error) ? error.routeId : match.route.id,
        error: isPageRouteExecutionError(error) ? error.error : error,
      });

      if (isActionDataRequest(request)) {
        return createJsonPayloadResponse(
          {
            routeId: match.route.id,
            ok: false,
            status: 500,
            actionData: null,
            revalidatedRouteIds: [],
            loaderData: {},
            deferredData: {},
            routeErrors,
          } satisfies ActionSubmissionPayload,
          500,
        );
      }

      return renderPageResponse({
        request,
        routes: options.routes,
        app: options.app,
        route: match,
        clientEntryPath: options.clientEntryPath,
        routeErrors,
        status: 500,
      });
    }

    if (actionResult instanceof Response) {
      return actionResult;
    }

    if (actionResult?.response) {
      return actionResult.response;
    }

    if (isActionDataRequest(request)) {
      return createActionDataResponse(request, match, options.app, actionResult);
    }

    return renderPageResponse({
      request,
      routes: options.routes,
      app: options.app,
      route: match,
      clientEntryPath: options.clientEntryPath,
      actionData:
        actionResult && actionResult.route
          ? {
              [actionResult.route.id]: actionResult.data,
            }
          : {},
    });
  }

  return renderPageResponse({
    request,
    routes: options.routes,
    app: options.app,
    route: match,
    clientEntryPath: options.clientEntryPath,
  });
}

function isActionMethod(method: string): boolean {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

function isActionDataRequest(request: Request): boolean {
  return isActionMethod(request.method) && acceptsJson(request);
}

function isNavigationDataRequest(request: Request): boolean {
  return !isActionMethod(request.method) && acceptsJson(request);
}

function acceptsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

async function createActionDataResponse(
  request: Request,
  match: NonNullable<ReturnType<typeof matchPageRoute>>,
  app: AppModule | undefined,
  actionResult: Awaited<ReturnType<typeof executeActionForMatch>>,
): Promise<Response> {
  const plan = createRevalidationPlan({
    currentMatch: match,
    nextMatch: match,
    currentUrl: new URL(request.url),
    nextUrl: new URL(request.url),
    actionRouteId: actionResult?.route.id,
    formMethod: request.method,
    formAction: new URL(request.url).pathname,
    actionStatus: actionResult?.response?.status ?? 200,
    actionResult: actionResult?.data,
  });
  const appPlan = createAppRevalidationPlan(app, {
    currentMatch: match,
    nextMatch: match,
    currentUrl: new URL(request.url),
    nextUrl: new URL(request.url),
    actionRouteId: actionResult?.route.id,
    formMethod: request.method,
    formAction: new URL(request.url).pathname,
    actionStatus: actionResult?.response?.status ?? 200,
    actionResult: actionResult?.data,
  });
  const appState = await resolveAppState(request, app, appPlan.shouldRevalidate);
  try {
    const loaded = await loadRouteData(match, request, plan.routeIds);
    if (loaded instanceof Response) {
      return loaded;
    }

    const routeErrors: Record<string, unknown> = {};
    const deferredData: Record<string, Record<string, unknown>> = {};

    for (const resolved of await collectResolvedDeferredChunks(loaded.pending, request.signal)) {
      if (resolved.error !== undefined) {
        Object.assign(
          routeErrors,
          assignNearestRouteError({
            routeErrors,
            matches: match.matches,
            failedRouteId: resolved.routeId,
            error: resolved.error,
          }),
        );
        continue;
      }

      deferredData[resolved.routeId] = {
        ...deferredData[resolved.routeId],
        [resolved.key]: resolved.data,
      };
    }

    const payload: ActionSubmissionPayload = {
      routeId: actionResult?.route.id ?? "",
      ok: true,
      status: 200,
      actionData: actionResult?.data ?? null,
      revalidatedRouteIds: plan.routeIds,
      loaderData: loaded.loaderData,
      deferredData,
      routeErrors,
      ...serializeAppState(appState),
    };

    return createJsonPayloadResponse(payload);
  } catch (error) {
    const routeErrors = assignNearestRouteError({
      routeErrors: {},
      matches: match.matches,
      failedRouteId: isPageRouteExecutionError(error) ? error.routeId : match.route.id,
      error: isPageRouteExecutionError(error) ? error.error : error,
    });

    return createJsonPayloadResponse(
      {
        routeId: actionResult?.route.id ?? match.route.id,
        ok: false,
        status: 500,
        actionData: actionResult?.data ?? null,
        revalidatedRouteIds: [],
        loaderData: {},
        deferredData: {},
        routeErrors,
        ...serializeAppState(appState),
      } satisfies ActionSubmissionPayload,
      500,
    );
  }
}

async function createNavigationDataResponse(
  request: Request,
  match: NonNullable<ReturnType<typeof matchPageRoute>>,
  routes: PageRouteRecord[],
  app?: AppModule,
): Promise<Response> {
  const currentUrl = readCurrentUrl(request);
  const currentMatch = currentUrl ? matchPageRoute(currentUrl.href, routes) : null;
  const nextUrl = new URL(request.url);
  const plan = createRevalidationPlan({
    currentMatch,
    nextMatch: match,
    currentUrl,
    nextUrl,
  });
  const appPlan = createAppRevalidationPlan(app, {
    currentMatch,
    nextMatch: match,
    currentUrl,
    nextUrl,
  });
  const appState = await resolveAppState(request, app, appPlan.shouldRevalidate);
  try {
    const loaded = await loadRouteData(match, request, plan.routeIds);
    if (loaded instanceof Response) {
      return loaded;
    }

    const routeErrors: Record<string, unknown> = {};
    const pendingDeferredKeys = collectPendingDeferredKeys(loaded.pending);

    if (loaded.pending.length > 0) {
      const payload: NavigationSubmissionPayload = {
        routeId: match.route.id,
        ok: true,
        status: 200,
        pathname: match.pathname,
        revalidatedRouteIds: plan.routeIds,
        loaderData: loaded.loaderData,
        deferredData: {},
        pendingDeferredKeys,
        routeErrors,
        ...serializeAppState(appState),
      };

      return new Response(createNavigationDataStream(payload, loaded.pending, request.signal), {
        status: 200,
        headers: {
          "content-type": "application/x-ndjson; charset=utf-8",
          "transfer-encoding": "chunked",
        },
      });
    }

    const deferredData: Record<string, Record<string, unknown>> = {};

    for (const resolved of await collectResolvedDeferredChunks(loaded.pending, request.signal)) {
      if (resolved.error !== undefined) {
        Object.assign(
          routeErrors,
          assignNearestRouteError({
            routeErrors,
            matches: match.matches,
            failedRouteId: resolved.routeId,
            error: resolved.error,
          }),
        );
        continue;
      }

      deferredData[resolved.routeId] = {
        ...deferredData[resolved.routeId],
        [resolved.key]: resolved.data,
      };
    }

    const payload: NavigationSubmissionPayload = {
      routeId: match.route.id,
      ok: true,
      status: 200,
      pathname: match.pathname,
      revalidatedRouteIds: plan.routeIds,
      loaderData: loaded.loaderData,
      deferredData,
      pendingDeferredKeys,
      routeErrors,
      ...serializeAppState(appState),
    };

    return createJsonPayloadResponse(payload);
  } catch (error) {
    const routeErrors = assignNearestRouteError({
      routeErrors: {},
      matches: match.matches,
      failedRouteId: isPageRouteExecutionError(error) ? error.routeId : match.route.id,
      error: isPageRouteExecutionError(error) ? error.error : error,
    });

    return createJsonPayloadResponse(
      {
        routeId: match.route.id,
        ok: false,
        status: 500,
        pathname: match.pathname,
        revalidatedRouteIds: [],
        loaderData: {},
        deferredData: {},
        routeErrors,
        ...serializeAppState(appState),
      } satisfies NavigationSubmissionPayload,
      500,
    );
  }
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

function serializeAppState(appState: { data: unknown; error: unknown }): {
  appData?: unknown;
  appError?: unknown;
} {
  const payload: {
    appData?: unknown;
    appError?: unknown;
  } = {};

  if (appState.data !== null && appState.data !== undefined) {
    payload.appData = appState.data;
  }

  if (appState.error !== null && appState.error !== undefined) {
    payload.appError = appState.error;
  }

  return payload;
}

function createNavigationDataStream(
  payload: NavigationSubmissionPayload,
  pending: PendingDeferredChunk[],
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encodeText(
          `${stringifyRuntimePayload({ type: "navigation", payload } satisfies NavigationPayloadEnvelope)}\n`,
        ),
      );

      for await (const resolved of iterateResolvedDeferredChunks(pending, signal)) {
        controller.enqueue(
          encodeText(`${stringifyRuntimePayload(encodeDeferredChunk(resolved))}\n`),
        );
      }

      controller.close();
    },
  });
}

function createJsonPayloadResponse(payload: unknown, status = 200): Response {
  return new Response(stringifyRuntimePayload(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
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

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function readCurrentUrl(request: Request): URL | null {
  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer);
  } catch {
    return null;
  }
}
