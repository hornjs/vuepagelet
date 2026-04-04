import type { Component, InjectionKey, ShallowReactive, ShallowRef } from "vue";
import type {
  ActionContext,
  ActionShouldRevalidateArgs,
  MiddlewareContext,
  NavigationShouldRevalidateArgs,
  PageRouteMatch,
  PageRouteRecord,
} from "../router/types.ts";

export interface DeferredChunk {
  routeId: string;
  key: string;
  data?: unknown;
  error?: unknown;
}

export interface DeferredChunkEnvelope {
  type: "deferred";
  chunk: DeferredChunk;
}

export interface NavigationPayloadEnvelope {
  type: "navigation";
  payload: NavigationSubmissionPayload;
}

export interface PageRuntimeState {
  routes: PageRouteRecord[];
  route: PageRouteMatch;
  transitionState: ShallowRef<TransitionSnapshot>;
  appData: unknown;
  appError: unknown;
  loaderData: Record<string, unknown>;
  actionData: Record<string, unknown>;
  deferredData: Record<string, Record<string, unknown>>;
  deferredErrors: Record<string, Record<string, unknown>>;
  pendingDeferredKeys: Record<string, string[]>;
  revalidatingRouteIds: string[];
  routeErrors: Record<string, unknown>;
}

export type NavigationState = "idle" | "loading" | "submitting" | "navigating";

export interface TransitionSnapshot {
  state: NavigationState;
  location: string;
  previousLocation?: string;
  action: "push" | "replace" | "pop";
  startTime: number;
  isReady: boolean;
}

export interface PendingDeferredChunk {
  routeId: string;
  key: string;
  promise: Promise<DeferredChunk>;
}

export interface LoadedRouteData {
  loaderData: Record<string, unknown>;
  pending: PendingDeferredChunk[];
}

export interface RenderContext {
  request: Request;
  routes: PageRouteRecord[];
  route: PageRouteMatch;
  state: PageRuntimeState;
  status?: number;
}

export interface AppModule {
  shell?: Component;
  loader?: (request: Request) => unknown | Promise<unknown>;
  error?: Component;
  shouldRevalidate?: (args: NavigationShouldRevalidateArgs | ActionShouldRevalidateArgs) => boolean;
}

export interface PageRendererOptions {
  routes: PageRouteRecord[];
  app?: AppModule;
}

export interface ActionExecutionResult {
  match: PageRouteMatch;
  route: PageRouteRecord;
  response?: Response;
  data?: unknown;
}

export interface ActionSubmissionPayload {
  routeId: string;
  ok: boolean;
  status: number;
  appData?: unknown;
  appError?: unknown;
  actionData?: unknown;
  revalidatedRouteIds?: string[];
  loaderData?: Record<string, unknown>;
  deferredData?: Record<string, Record<string, unknown>>;
  routeErrors?: Record<string, unknown>;
}

export interface NavigationSubmissionPayload {
  routeId: string;
  ok: boolean;
  status: number;
  pathname: string;
  appData?: unknown;
  appError?: unknown;
  revalidatedRouteIds: string[];
  loaderData: Record<string, unknown>;
  deferredData: Record<string, Record<string, unknown>>;
  pendingDeferredKeys?: Record<string, string[]>;
  routeErrors?: Record<string, unknown>;
}

export interface RuntimeMiddlewareContext extends MiddlewareContext {
  action?: ActionContext;
}

export type RuntimeMiddlewareHandler<T> = (
  context: RuntimeMiddlewareContext,
  next: () => Promise<T>,
) => Promise<T>;

export const pageRuntimeStateKey: InjectionKey<ShallowReactive<PageRuntimeState>> =
  Symbol("page-runtime-state");
