export interface SubmitOptions {
  action?: string;
  method?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

export type SubmitTarget =
  | HTMLFormElement
  | FormData
  | URLSearchParams
  | Record<string, unknown>
  | undefined;

export function createSubmitRequest(
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

export function normalizeMethod(method?: string): string {
  return (method ?? "post").toUpperCase();
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
