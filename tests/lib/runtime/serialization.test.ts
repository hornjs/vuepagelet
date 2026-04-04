import { describe, expect, it } from "vitest";
import {
  parseRuntimePayload,
  serializeRuntimeScriptValue,
  stringifyRuntimePayload,
} from "../../../src/lib/runtime/serialization.ts";

describe("runtime serialization", () => {
  it("round-trips rich payload values over transport", () => {
    const payload = {
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
      tags: new Set(["a", "b"]),
      lookup: new Map([
        ["hello", 1],
        ["world", 2],
      ]),
      source: new URL("https://example.com/posts/hello"),
      error: new Error("boom"),
    };

    const revived = parseRuntimePayload<typeof payload>(stringifyRuntimePayload(payload));

    expect(revived.createdAt).toBeInstanceOf(Date);
    expect(revived.createdAt.toISOString()).toBe("2026-03-27T00:00:00.000Z");
    expect(revived.tags).toBeInstanceOf(Set);
    expect([...revived.tags]).toEqual(["a", "b"]);
    expect(revived.lookup).toBeInstanceOf(Map);
    expect([...revived.lookup.entries()]).toEqual([
      ["hello", 1],
      ["world", 2],
    ]);
    expect(revived.source).toBeInstanceOf(URL);
    expect(revived.source.href).toBe("https://example.com/posts/hello");
    expect(revived.error).toBeInstanceOf(Error);
    expect(revived.error.message).toBe("boom");
  });

  it("serializes script payloads without dropping built-in values or breaking closing script tags", () => {
    const expression = serializeRuntimeScriptValue({
      url: new URL("https://example.com/</script>"),
      error: new Error("bad </script>"),
      createdAt: new Date("2026-03-27T00:00:00.000Z"),
    });

    expect(expression).toContain("new URL(");
    expect(expression).toContain("new Date(");
    expect(expression).toContain("\\u003C/script");
    expect(expression).toContain("message");
  });
});
