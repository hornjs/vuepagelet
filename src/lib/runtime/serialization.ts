import { parse, stringify, uneval } from "devalue";

interface SerializedErrorShape {
  __vue_route_runtime_type: "Error";
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
}

const ERROR_TYPE = "Error";
const ERROR_MARKER = "__vue_route_runtime_type";

export function stringifyRuntimePayload(value: unknown): string {
  return stringify(value, {
    [ERROR_TYPE]: (candidate: unknown) => {
      if (!(candidate instanceof Error)) {
        return undefined;
      }

      return {
        name: candidate.name,
        message: candidate.message,
        stack: candidate.stack,
        cause: getErrorCause(candidate),
      } satisfies Omit<SerializedErrorShape, "__vue_route_runtime_type">;
    },
  });
}

export function parseRuntimePayload<T>(value: string): T {
  try {
    return parse(value, {
      [ERROR_TYPE]: (candidate: unknown) => {
        const source = isSerializedErrorPayload(candidate)
          ? candidate
          : ({
              name: "Error",
              message: String(candidate),
            } satisfies Omit<SerializedErrorShape, "__vue_route_runtime_type">);

        const error = new Error(source.message) as Error & {
          cause?: unknown;
        };
        error.name = source.name;
        if (source.cause !== undefined) {
          error.cause = source.cause;
        }
        if (source.stack) {
          error.stack = source.stack;
        }
        return error;
      },
    }) as T;
  } catch {
    return JSON.parse(value) as T;
  }
}

export function serializeRuntimeScriptValue(value: unknown): string {
  return escapeScriptExpression(uneval(prepareRuntimeScriptValue(value)));
}

function prepareRuntimeScriptValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value instanceof Error) {
    const serialized: SerializedErrorShape = {
      [ERROR_MARKER]: ERROR_TYPE,
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause:
        getErrorCause(value) !== undefined
          ? prepareRuntimeScriptValue(getErrorCause(value), seen)
          : undefined,
    };
    return serialized;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (
    value instanceof Date ||
    value instanceof URL ||
    value instanceof RegExp ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }

  if (seen.has(value)) {
    return seen.get(value);
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const entry of value) {
      copy.push(prepareRuntimeScriptValue(entry, seen));
    }
    return copy;
  }

  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    seen.set(value, copy);
    for (const [key, entry] of value.entries()) {
      copy.set(prepareRuntimeScriptValue(key, seen), prepareRuntimeScriptValue(entry, seen));
    }
    return copy;
  }

  if (value instanceof Set) {
    const copy = new Set<unknown>();
    seen.set(value, copy);
    for (const entry of value.values()) {
      copy.add(prepareRuntimeScriptValue(entry, seen));
    }
    return copy;
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);

  for (const [key, entry] of Object.entries(value)) {
    copy[key] = prepareRuntimeScriptValue(entry, seen);
  }

  return copy;
}

function isSerializedErrorPayload(
  value: unknown,
): value is Omit<SerializedErrorShape, "__vue_route_runtime_type"> {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "message" in value &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

function escapeScriptExpression(value: string): string {
  return value
    .replace(/<\/script/gi, "<\\/script")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function getErrorCause(error: Error): unknown {
  return (error as Error & { cause?: unknown }).cause;
}
