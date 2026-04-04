import { hydratePage, type HydratePageOptions, type HydratedPageApp } from "../dom/client.ts";
import { renderPageResponse } from "../dom/ssr/renderer.ts";
import { createRouteResolver } from "../router/matcher.ts";
import {
  createPageRouter,
  type CreatePageRouterOptions,
  type PageRouter,
} from "../router/router.ts";
import type {
  PageRouteMatch,
  PageRouteRecord,
  ResolvedNavigationLocation,
} from "../router/types.ts";
import { handlePageRequest, type PageRequestHandlerOptions } from "../runtime/request.ts";
import type { AppModule } from "../runtime/types.ts";

export interface CreateRouteRuntimeIntegrationOptions {
  routes: PageRouteRecord[];
  app?: AppModule;
  clientEntryPath?: string;
}

export interface RouteRuntimeIntegration {
  routes: PageRouteRecord[];
  app?: AppModule;
  clientEntryPath?: string;
  hydrate(): HydratedPageApp;
  handleRequest(request: Request): Promise<Response>;
  render(request: Request): Promise<Response>;
  createRouter(options?: Omit<CreatePageRouterOptions, "routes">): PageRouter;
  match(url: string): PageRouteMatch | null;
  resolveLocation(url: string): ResolvedNavigationLocation | null;
}

export function createRouteRuntimeIntegration(
  options: CreateRouteRuntimeIntegrationOptions,
): RouteRuntimeIntegration {
  const resolver = createRouteResolver(options.routes);

  return {
    routes: options.routes,
    app: options.app,
    clientEntryPath: options.clientEntryPath,
    hydrate() {
      return hydratePage(createHydrateOptions(options));
    },
    handleRequest(request: Request) {
      return handlePageRequest(request, createRequestOptions(options));
    },
    render(request: Request) {
      return renderPageResponse({
        request,
        routes: options.routes,
        app: options.app,
        clientEntryPath: options.clientEntryPath,
      });
    },
    createRouter(routerOptions = {}) {
      return createPageRouter({
        ...routerOptions,
        routes: options.routes,
      });
    },
    match(url: string) {
      return resolver.resolve(url);
    },
    resolveLocation(url: string) {
      return resolver.resolveLocation(url);
    },
  };
}

function createHydrateOptions(options: CreateRouteRuntimeIntegrationOptions): HydratePageOptions {
  return {
    routes: options.routes,
    app: options.app,
  };
}

function createRequestOptions(
  options: CreateRouteRuntimeIntegrationOptions,
): PageRequestHandlerOptions {
  return {
    routes: options.routes,
    app: options.app,
    clientEntryPath: options.clientEntryPath,
  };
}
