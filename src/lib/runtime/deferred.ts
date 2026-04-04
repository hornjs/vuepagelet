import type {
  DeferredChunk,
  DeferredChunkEnvelope,
  LoadedRouteData,
  PendingDeferredChunk,
} from "./types.ts";
import type { DeferredDataRecord, LoaderContext, PageRouteMatch } from "../router/types.ts";
import { normalizeRouteError, PageRouteExecutionError } from "./route-errors.ts";

export function defer(
  critical: Record<string, unknown> = {},
  deferred: Record<string, unknown | Promise<unknown>> = {},
): DeferredDataRecord {
  return {
    __deferred_data__: true,
    critical,
    deferred,
  };
}

export function isDeferredData(value: unknown): value is DeferredDataRecord {
  return Boolean(
    value &&
    typeof value === "object" &&
    "__deferred_data__" in value &&
    (value as { __deferred_data__?: unknown }).__deferred_data__ === true,
  );
}

export async function loadRouteData(
  match: PageRouteMatch,
  request: Request,
  routeIds?: string[],
): Promise<LoadedRouteData | Response> {
  const loaderData: Record<string, unknown> = {};
  const pending: PendingDeferredChunk[] = [];
  const targetRouteIds = routeIds ? new Set(routeIds) : null;

  for (const route of match.matches) {
    const loader = route.module.loader;
    if (!loader || (targetRouteIds && !targetRouteIds.has(route.id))) {
      continue;
    }

    let result: Awaited<ReturnType<typeof loader>>;

    try {
      result = await loader(createLoaderContext(match, request, route));
    } catch (error) {
      throw new PageRouteExecutionError({
        phase: "loader",
        routeId: route.id,
        error,
        loaderData,
        pending,
      });
    }

    if (result instanceof Response) {
      return result;
    }

    if (isDeferredData(result)) {
      loaderData[route.id] = { ...result.critical };
      pending.push(...createPendingChunks(route.id, result.deferred));
      continue;
    }

    loaderData[route.id] = result;
  }

  return {
    loaderData,
    pending,
  };
}

export function encodeDeferredChunk(chunk: DeferredChunk): DeferredChunkEnvelope {
  return {
    type: "deferred",
    chunk,
  };
}

export async function* iterateResolvedDeferredChunks(
  pending: PendingDeferredChunk[],
  signal?: AbortSignal,
): AsyncGenerator<DeferredChunk> {
  if (signal?.aborted) {
    return;
  }

  const active = pending.map((chunk, index) => ({
    id: index,
    promise: chunk.promise.then((resolved) => ({
      id: index,
      resolved,
    })),
  }));

  while (active.length > 0) {
    const settled = await Promise.race([
      ...active.map((entry) => entry.promise),
      createAbortResult(signal),
    ]);

    if (!settled || "aborted" in settled) {
      return;
    }

    const index = active.findIndex((entry) => entry.id === settled.id);
    if (index !== -1) {
      active.splice(index, 1);
    }
    yield settled.resolved;
  }
}

export async function collectResolvedDeferredChunks(
  pending: PendingDeferredChunk[],
  signal?: AbortSignal,
): Promise<DeferredChunk[]> {
  const resolved: DeferredChunk[] = [];

  for await (const chunk of iterateResolvedDeferredChunks(pending, signal)) {
    resolved.push(chunk);
  }

  return resolved;
}

function createAbortResult(signal?: AbortSignal): Promise<{ aborted: true }> {
  if (!signal) {
    return new Promise(() => {});
  }

  if (signal.aborted) {
    return Promise.resolve({ aborted: true });
  }

  return new Promise((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve({ aborted: true });
      },
      { once: true },
    );
  });
}

function createPendingChunks(
  routeId: string,
  deferred: Record<string, unknown | Promise<unknown>>,
): PendingDeferredChunk[] {
  return Object.entries(deferred).map(([key, value]) => ({
    routeId,
    key,
    promise: Promise.resolve(value).then(
      (data) => ({
        routeId,
        key,
        data,
      }),
      (error) => ({
        routeId,
        key,
        error: normalizeRouteError(error),
      }),
    ),
  }));
}

function createLoaderContext(
  match: PageRouteMatch,
  request: Request,
  route: PageRouteMatch["route"],
): LoaderContext {
  const url = new URL(request.url);

  return {
    request,
    params: match.params,
    query: url.searchParams,
    route,
    matches: match.matches,
  };
}
