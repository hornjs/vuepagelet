import type { Component } from "vue";
import type {
  RouteLocationAsRelativeGeneric,
  RouteLocationNormalizedLoaded,
  RouteRecordRaw,
} from "vue-router";

export type PageParams = Record<string, string>;
export type PageQuery = Record<string, string>;

export interface LoaderContext {
  request: Request;
  params: PageParams;
  query: URLSearchParams;
  route: PageRouteRecord;
  matches: PageRouteRecord[];
}

export interface ActionContext extends LoaderContext {
  formData: FormData;
}

export interface MiddlewareContext extends LoaderContext {
  phase: "render" | "action";
}

export type MiddlewareNext = () => Promise<Response | void>;
export type PageMiddleware = (
  context: MiddlewareContext,
  next: MiddlewareNext,
) => Response | void | Promise<Response | void>;

export interface DeferredDataRecord {
  readonly __deferred_data__: true;
  critical?: Record<string, unknown>;
  deferred: Record<string, unknown | Promise<unknown>>;
}

export type LoaderResult = unknown | Response | DeferredDataRecord | Promise<unknown | Response>;
export type ActionResult = unknown | Response | Promise<unknown | Response>;

export interface BaseShouldRevalidateArgs {
  currentUrl: URL | null;
  nextUrl: URL;
  currentParams: PageParams;
  nextParams: PageParams;
  defaultShouldRevalidate: boolean;
}

export interface NavigationShouldRevalidateArgs extends BaseShouldRevalidateArgs {
  type: "navigation";
}

export interface ActionShouldRevalidateArgs extends BaseShouldRevalidateArgs {
  type: "action";
  formMethod: string;
  formAction: string;
  actionStatus: number;
  actionRouteId: string;
  actionResult?: unknown;
}

export type ShouldRevalidateArgs = NavigationShouldRevalidateArgs | ActionShouldRevalidateArgs;

export interface BasePageRouteModule {
  layout?: Component;
  loading?: Component;
  error?: Component;
  component?: Component;
  loader?: (context: LoaderContext) => LoaderResult;
  middleware?: PageMiddleware[];
  shouldRevalidate?: (args: ShouldRevalidateArgs) => boolean;
}

export interface PageComponentRouteModule extends BasePageRouteModule {
  component?: Component;
  action?: (context: ActionContext) => ActionResult;
}

export interface PageGroupRouteModule extends BasePageRouteModule {
  component?: never;
  action?: never;
}

export type PageRouteModule = PageComponentRouteModule | PageGroupRouteModule;

export interface PageRouteRecord {
  id: string;
  path?: string;
  name?: string;
  module: PageRouteModule;
  children: PageRouteRecord[];
}

export interface PageRouteMatch {
  route: PageRouteRecord;
  matches: PageRouteRecord[];
  params: PageParams;
  pathname: string;
  query: PageQuery;
  hash: string;
}

export interface ResolvedNavigationLocation {
  path: string;
  fullPath: string;
  params: PageParams;
  query: PageQuery;
  hash: string;
  matched: PageRouteRecord[];
}

export interface RouteResolver {
  resolve(pathname: string): PageRouteMatch | null;
  resolveLocation(pathname: string): ResolvedNavigationLocation | null;
  toVueRoutes(): RouteRecordRaw[];
}

export type PageRouteTo = string | RouteLocationAsRelativeGeneric;

export interface PageRouteLocation {
  path: string;
  fullPath: string;
  params: PageParams;
  query: PageQuery;
  hash: string;
  matched: PageRouteRecord[];
  route: PageRouteRecord | null;
  native: RouteLocationNormalizedLoaded | null;
}
