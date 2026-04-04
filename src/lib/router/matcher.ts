import {
  START_LOCATION,
  createRouterMatcher,
  type RouteRecordRaw,
  type RouterMatcher,
} from "vue-router";
import { createRouteLocationKey } from "./location.ts";
import type {
  PageQuery,
  PageRouteMatch,
  PageRouteRecord,
  ResolvedNavigationLocation,
  RouteResolver,
} from "./types.ts";
import { createPageRouteComponent, createPageRouteMeta } from "./router.ts";

interface MatchedRouteLike {
  name?: unknown;
}

interface CachedResolver {
  matcher: RouterMatcher;
  routeMap: Map<string, PageRouteRecord>;
}

const cache = new WeakMap<PageRouteRecord[], CachedResolver>();

export function createRouteResolver(routes: PageRouteRecord[]): RouteResolver {
  return {
    resolve(pathname) {
      return matchPageRoute(pathname, routes);
    },
    resolveLocation(pathname) {
      return resolveNavigationLocation(pathname, routes);
    },
    toVueRoutes() {
      return createVuePageRouteRecords(routes);
    },
  };
}

export function matchPageRoute(pathname: string, routes: PageRouteRecord[]): PageRouteMatch | null {
  const url = new URL(pathname, "http://local");
  const resolver = getCachedResolver(routes);
  const resolved = resolver.matcher.resolve({ path: normalizePath(url.pathname) }, START_LOCATION);
  const matched = mapMatchedRoutes(resolved.matched, resolver.routeMap);
  const route = matched[matched.length - 1];

  if (!route) {
    return null;
  }

  return {
    route,
    matches: matched,
    params: normalizeParams(resolved.params),
    pathname: normalizePath(url.pathname),
    query: normalizeUrlQuery(url.searchParams),
    hash: url.hash,
  };
}

export function resolveNavigationLocation(
  pathname: string,
  routes: PageRouteRecord[],
): ResolvedNavigationLocation | null {
  const match = matchPageRoute(pathname, routes);
  if (!match) {
    return null;
  }

  return {
    path: match.pathname,
    fullPath: createRouteLocationKey(match),
    params: match.params,
    query: match.query,
    hash: match.hash,
    matched: match.matches,
  };
}

export function createVuePageRouteRecords(routes: PageRouteRecord[]): RouteRecordRaw[] {
  return routes.map((route, index) => createVueRouteRecord(route, index === 0));
}

function getCachedResolver(routes: PageRouteRecord[]): CachedResolver {
  const cached = cache.get(routes);
  if (cached) {
    return cached;
  }

  const created: CachedResolver = {
    matcher: createRouterMatcher(createVuePageRouteRecords(routes), {}),
    routeMap: new Map(flattenRoutes(routes).map((route) => [route.id, route])),
  };

  cache.set(routes, created);
  return created;
}

function createVueRouteRecord(route: PageRouteRecord, isRoot: boolean): RouteRecordRaw {
  const routePath = route.path ?? "";

  return {
    path: isRoot ? withLeadingSlash(routePath) : stripLeadingSlash(routePath),
    name: route.id,
    component: createPageRouteComponent(route),
    meta: createPageRouteMeta(route),
    children: route.children.map((child) => createVueRouteRecord(child, false)),
  };
}

function flattenRoutes(routes: PageRouteRecord[]): PageRouteRecord[] {
  return routes.flatMap((route) => [route, ...flattenRoutes(route.children)]);
}

function mapMatchedRoutes(
  matched: MatchedRouteLike[],
  routeMap: Map<string, PageRouteRecord>,
): PageRouteRecord[] {
  return matched
    .map((record) => (typeof record.name === "string" ? routeMap.get(record.name) : undefined))
    .filter((record): record is PageRouteRecord => Boolean(record));
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function withLeadingSlash(pathname: string): string {
  return normalizePath(pathname);
}

function stripLeadingSlash(pathname: string): string {
  if (!pathname) {
    return "";
  }

  return pathname === "/" ? "" : pathname.replace(/^\/+/, "");
}

function normalizeParams(params: Record<string, unknown>): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      resolved[key] = value.map((entry) => String(entry ?? "")).join("/");
      continue;
    }

    resolved[key] = String(value ?? "");
  }

  return resolved;
}

function normalizeQuery(query: Record<string, unknown>): PageQuery {
  const resolved: PageQuery = {};

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      resolved[key] = String(value[value.length - 1] ?? "");
      continue;
    }

    resolved[key] = String(value ?? "");
  }

  return resolved;
}

function normalizeUrlQuery(query: URLSearchParams): PageQuery {
  return normalizeQuery(Object.fromEntries(query.entries()));
}
