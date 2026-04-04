import type { PageRouteMatch, PageRouteRecord } from "../../router/types.ts";
import type { AppModule } from "../../runtime/types.ts";

export interface InitialPayload {
  routeId: string;
  appData?: unknown;
  appError?: unknown;
  state?: Record<string, unknown>;
  loaderData: Record<string, unknown>;
  actionData: Record<string, unknown>;
  pendingDeferredKeys: Record<string, string[]>;
  routeErrors: Record<string, unknown>;
}

export interface StreamRenderOptions {
  request: Request;
  routes: PageRouteRecord[];
  app?: AppModule;
  route?: PageRouteMatch;
  actionData?: Record<string, unknown>;
  routeErrors?: Record<string, unknown>;
  status?: number;
  clientEntryPath?: string;
}
