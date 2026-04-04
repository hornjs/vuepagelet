import type {
  ActionContext,
  ActionResult,
  PageRouteMatch,
  PageRouteRecord,
} from "../router/types.ts";
import { matchPageRoute } from "../router/matcher.ts";
import type { ActionExecutionResult } from "./types.ts";
import { PageRouteExecutionError } from "./route-errors.ts";

export async function executeMatchedAction(
  request: Request,
  routes: PageRouteRecord[],
): Promise<ActionExecutionResult | null> {
  const match = matchPageRoute(request.url, routes);
  if (!match) {
    return null;
  }

  return executeActionForMatch(request, match);
}

export async function executeActionForMatch(
  request: Request,
  match: PageRouteMatch,
): Promise<ActionExecutionResult | null> {
  const actionRoute = [...match.matches].reverse().find((route) => route.module.action);
  if (!actionRoute?.module.action) {
    return null;
  }

  const formData = await readRequestFormData(request);
  let result: ActionResult;

  try {
    result = await actionRoute.module.action(
      createActionContext(request, formData, match, actionRoute),
    );
  } catch (error) {
    throw new PageRouteExecutionError({
      phase: "action",
      routeId: actionRoute.id,
      error,
    });
  }

  if (result instanceof Response) {
    return {
      match,
      route: actionRoute,
      response: result,
    };
  }

  return {
    match,
    route: actionRoute,
    data: result,
  };
}

async function readRequestFormData(request: Request): Promise<FormData> {
  try {
    return await request.clone().formData();
  } catch {
    return new FormData();
  }
}

function createActionContext(
  request: Request,
  formData: FormData,
  match: PageRouteMatch,
  route: PageRouteRecord,
): ActionContext {
  const url = new URL(request.url);

  return {
    request,
    formData,
    params: match.params,
    query: url.searchParams,
    route,
    matches: match.matches,
  };
}
