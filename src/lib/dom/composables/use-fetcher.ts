import { ref, type Ref } from "vue";
import type { ActionSubmissionPayload } from "../../runtime/types.ts";
import { normalizeMethod, type SubmitOptions, type SubmitTarget } from "./submit-shared.ts";
import { useSubmit } from "./use-submit.ts";

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
