import { matchPageRoute } from "../../router/matcher.ts";
import { clearMatchedRouteErrors } from "../../runtime/route-errors.ts";
import { pruneRouteStateMaps } from "../../runtime/route-state.ts";
import { parseRuntimePayload } from "../../runtime/serialization.ts";
import { applyActionData, applyAppState, usePageRuntimeState } from "../../runtime/state.ts";
import { finishSubmitting, startSubmitting } from "../../runtime/transition-manager.ts";
import type { ActionSubmissionPayload } from "../../runtime/types.ts";
import { useCurrentPageRoute, usePageRoute, useRoute } from "./use-route.ts";
import { createSubmitRequest, normalizeMethod, type SubmitOptions, type SubmitTarget } from "./submit-shared.ts";

export type { SubmitOptions, SubmitTarget } from "./submit-shared.ts";

export function useSubmit(): (
  target?: SubmitTarget,
  options?: SubmitOptions,
) => Promise<ActionSubmissionPayload> {
  const state = usePageRuntimeState();
  const route = useRoute();
  const currentPageRoute = useCurrentPageRoute();
  const pageRoute = usePageRoute();

  return async (target, options = {}) => {
    const method = normalizeMethod(options.method);
    const action = options.action ?? route.value.path;
    const request = createSubmitRequest(action, method, target, options.signal);
    const headers = new Headers(request.headers);
    headers.set("accept", "application/json");
    startSubmitting(state, action);

    try {
      const response = await (options.fetcher ?? fetch)(request, {
        headers,
        signal: options.signal,
      });

      const payload = parseRuntimePayload<ActionSubmissionPayload>(await response.text());
      const routeMatch = matchPageRoute(action, state.routes);
      const routeId =
        payload.routeId ||
        routeMatch?.route.id ||
        currentPageRoute?.id ||
        pageRoute.value?.id ||
        state.route.route.id;

      const normalizedPayload: ActionSubmissionPayload = {
        ...payload,
        routeId,
        status: payload.status ?? response.status,
        ok: payload.ok ?? response.ok,
      };

      const nextState = pruneRouteStateMaps(normalizedPayload.revalidatedRouteIds ?? [], {
        deferredData: state.deferredData,
        deferredErrors: state.deferredErrors,
        pendingDeferredKeys: state.pendingDeferredKeys,
        routeErrors: clearMatchedRouteErrors(state.routeErrors, state.route.matches),
      });

      state.loaderData = {
        ...state.loaderData,
        ...normalizedPayload.loaderData,
      };
      applyAppState(state, normalizedPayload);
      state.deferredData = {
        ...nextState.deferredData,
        ...normalizedPayload.deferredData,
      };
      state.deferredErrors = nextState.deferredErrors ?? {};
      state.pendingDeferredKeys = nextState.pendingDeferredKeys ?? {};
      state.routeErrors = {
        ...nextState.routeErrors,
        ...normalizedPayload.routeErrors,
      };
      applyActionData(state, normalizedPayload);
      return normalizedPayload;
    } finally {
      finishSubmitting(state);
    }
  };
}
