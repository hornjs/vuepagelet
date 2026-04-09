import { describe, expect, it } from "vitest";
import { renderPageResponse } from "../../src/lib/dom/ssr/renderer.ts";
import { app, routes } from "../../examples/todo-app/routes.ts";

describe("todo-app shell", () => {
  it("renders the showcase shell and main navigation", async () => {
    const response = await renderPageResponse({
      request: new Request("http://local/"),
      routes,
      app,
    });
    const html = await response.text();

    expect(html).toContain("Todo Showcase");
    expect(html).toContain('href="/head"');
    expect(html).toContain('href="/debug"');
  });
});
