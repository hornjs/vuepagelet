import type { PendingDeferredChunk } from "./types.ts";
import type { PageRouteRecord } from "../router/types.ts";

export class PageRouteExecutionError extends Error {
  phase: "loader" | "action" | "render";
  routeId: string;
  error: unknown;
  loaderData?: Record<string, unknown>;
  pending?: PendingDeferredChunk[];

  constructor(options: {
    phase: "loader" | "action" | "render";
    routeId: string;
    error: unknown;
    loaderData?: Record<string, unknown>;
    pending?: PendingDeferredChunk[];
  }) {
    super(
      options.error instanceof Error
        ? options.error.message
        : `page route ${options.phase} failed for ${options.routeId}`,
    );
    this.name = "PageRouteExecutionError";
    this.phase = options.phase;
    this.routeId = options.routeId;
    this.error = normalizeRouteError(options.error);
    this.loaderData = options.loaderData;
    this.pending = options.pending;
  }
}

export function isPageRouteExecutionError(error: unknown): error is PageRouteExecutionError {
  return error instanceof PageRouteExecutionError;
}

export function normalizeRouteError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return error;
}

export function resolveNearestErrorBoundary(
  matches: PageRouteRecord[],
  failedRouteId: string,
): PageRouteRecord | null {
  const startIndex = matches.findIndex((route) => route.id === failedRouteId);
  if (startIndex === -1) {
    return null;
  }

  for (let index = startIndex; index >= 0; index -= 1) {
    const route = matches[index];
    if (route?.module.error) {
      return route;
    }
  }

  return null;
}

export function assignNearestRouteError(options: {
  routeErrors: Record<string, unknown>;
  matches: PageRouteRecord[];
  failedRouteId: string;
  error: unknown;
}): Record<string, unknown> {
  const boundary = resolveNearestErrorBoundary(options.matches, options.failedRouteId);
  if (!boundary) {
    return options.routeErrors;
  }

  return {
    ...options.routeErrors,
    [boundary.id]: normalizeRouteError(options.error),
  };
}

export function clearMatchedRouteErrors(
  routeErrors: Record<string, unknown>,
  matches: PageRouteRecord[],
): Record<string, unknown> {
  const boundaryRouteIds = new Set(
    matches.filter((route) => Boolean(route.module.error)).map((route) => route.id),
  );

  return Object.fromEntries(
    Object.entries(routeErrors).filter(([routeId]) => !boundaryRouteIds.has(routeId)),
  );
}

export function deriveRouteErrors(
  matches: PageRouteRecord[],
  snapshot?: {
    routeErrors?: Record<string, unknown>;
    deferredErrors?: Record<string, Record<string, unknown>>;
  },
): Record<string, unknown> {
  let routeErrors = { ...snapshot?.routeErrors };

  for (const [routeId, deferredErrors] of Object.entries(snapshot?.deferredErrors ?? {})) {
    for (const error of Object.values(deferredErrors)) {
      routeErrors = assignNearestRouteError({
        routeErrors,
        matches,
        failedRouteId: routeId,
        error,
      });
    }
  }

  return routeErrors;
}
