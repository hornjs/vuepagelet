import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const todoRoot = resolve(import.meta.dirname, "../../examples/todo-app");

describe("todo-app example scaffold", () => {
  it("includes the expected package-style entry files", () => {
    expect(existsSync(resolve(todoRoot, "README.md"))).toBe(true);
    expect(existsSync(resolve(todoRoot, "server.ts"))).toBe(true);
    expect(existsSync(resolve(todoRoot, "client.ts"))).toBe(true);
    expect(existsSync(resolve(todoRoot, "routes.ts"))).toBe(true);
    expect(existsSync(resolve(todoRoot, "store.ts"))).toBe(true);
  });
});
