import type { PageRouteMatch, PageRouteRecord } from "../router/types.ts";
import type { RuntimeMiddlewareHandler } from "./types.ts";

export async function runWithRouteMiddleware<T>(
  route: PageRouteMatch,
  request: Request,
  phase: "render" | "action",
  handler: RuntimeMiddlewareHandler<T>,
): Promise<T | Response> {
  const stack = collectRouteMiddleware(route.matches);
  let index = -1;

  return dispatch(0);

  async function dispatch(position: number): Promise<T | Response> {
    if (position <= index) {
      throw new Error("middleware next() called multiple times");
    }

    index = position;
    const middleware = stack[position];

    if (!middleware) {
      return handler(
        {
          request,
          params: route.params,
          query: new URL(request.url).searchParams,
          route: route.route,
          matches: route.matches,
          phase,
        },
        async () => undefined as T,
      );
    }

    let downstreamResult: T | Response | undefined;
    const middlewareResult = await middleware(
      {
        request,
        params: route.params,
        query: new URL(request.url).searchParams,
        route: route.route,
        matches: route.matches,
        phase,
      },
      async () => {
        downstreamResult = await dispatch(position + 1);
        return downstreamResult instanceof Response ? downstreamResult : undefined;
      },
    );

    if (middlewareResult instanceof Response) {
      return middlewareResult;
    }

    return downstreamResult as T | Response;
  }
}

export function collectRouteMiddleware(matches: PageRouteRecord[]) {
  return matches.flatMap((route) => route.module.middleware ?? []);
}
