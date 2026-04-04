import { computed, ref, type ComputedRef, type Ref } from "vue";
import { matchPageRoute } from "../../router/matcher.ts";
import { pruneRouteStateMaps } from "../../runtime/route-state.ts";
import { applyActionData, applyAppState, usePageRuntimeState } from "../../runtime/state.ts";
import { clearMatchedRouteErrors } from "../../runtime/route-errors.ts";
import { parseRuntimePayload } from "../../runtime/serialization.ts";
import { finishSubmitting, startSubmitting } from "../../runtime/transition-manager.ts";
import type { ActionSubmissionPayload } from "../../runtime/types.ts";
import { useCurrentPageRoute, usePageRoute, useRoute } from "./use-route.ts";

export interface SubmitOptions {
  action?: string;
  method?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

export interface FetcherSubmitOptions extends SubmitOptions {
  onSuccess?: (payload: ActionSubmissionPayload) => void;
}

export interface FetcherState<T = unknown> {
  state: Ref<"idle" | "submitting">;
  data: Ref<T | null>;
  formAction: Ref<string>;
  formMethod: Ref<string>;
  submit: (
    target: SubmitTarget,
    options?: FetcherSubmitOptions,
  ) => Promise<ActionSubmissionPayload>;
}

export type SubmitTarget =
  | HTMLFormElement
  | FormData
  | URLSearchParams
  | Record<string, unknown>
  | undefined;

export function useFormAction(action?: string): ComputedRef<string> {
  const route = useRoute();

  return computed(() => action ?? route.value.path);
}

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

export function useFetcher<T = unknown>(): FetcherState<T> {
  const state = ref<"idle" | "submitting">("idle");
  const data = ref<T | null>(null) as Ref<T | null>;
  const formAction = ref("");
  const formMethod = ref("post");
  const submit = useSubmit();

  return {
    state,
    data,
    formAction,
    formMethod,
    async submit(target?: SubmitTarget, options: FetcherSubmitOptions = {}) {
      formAction.value = options.action ?? "";
      formMethod.value = normalizeMethod(options.method);
      state.value = "submitting";

      try {
        const payload = await submit(target, options);
        data.value = (payload.actionData as T | undefined) ?? null;
        options.onSuccess?.(payload);
        return payload;
      } finally {
        state.value = "idle";
      }
    },
  };
}

function createSubmitRequest(
  action: string,
  method: string,
  target?: SubmitTarget,
  signal?: AbortSignal,
): Request {
  const base = typeof window === "undefined" ? "http://local" : window.location.origin;
  const url = new URL(action, base);
  const body = toFormData(target);

  if (method === "GET") {
    for (const [key, value] of body.entries()) {
      url.searchParams.append(key, String(value));
    }

    return new Request(url, {
      method,
      signal,
    });
  }

  return new Request(url, {
    method,
    body,
    signal,
  });
}

function toFormData(target?: SubmitTarget): FormData {
  if (target instanceof FormData) {
    return target;
  }

  if (typeof HTMLFormElement !== "undefined" && target instanceof HTMLFormElement) {
    return new FormData(target);
  }

  if (target instanceof URLSearchParams) {
    const formData = new FormData();
    target.forEach((value, key) => {
      formData.append(key, value);
    });
    return formData;
  }

  const formData = new FormData();

  if (!target) {
    return formData;
  }

  for (const [key, value] of Object.entries(target)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry != null) {
          formData.append(key, String(entry));
        }
      }
      continue;
    }

    if (value != null) {
      formData.append(key, String(value));
    }
  }

  return formData;
}

function normalizeMethod(method?: string): string {
  return (method ?? "post").toUpperCase();
}
