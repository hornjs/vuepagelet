import { describe, expect, it } from "vitest";
import { runWithRouteMiddleware } from "../../../src/lib/runtime/middleware.ts";
import type { PageRouteMatch, PageRouteRecord } from "../../../src/lib/router/types.ts";

function createMatch(): PageRouteMatch {
  const root: PageRouteRecord = {
    id: "root",
    path: "/",
    module: {},
    children: [],
  };
  const posts: PageRouteRecord = {
    id: "posts",
    path: "posts",
    module: {},
    children: [],
  };
  const postDetail: PageRouteRecord = {
    id: "post-detail",
    path: ":slug",
    module: {},
    children: [],
  };

  return {
    route: postDetail,
    matches: [root, posts, postDetail],
    params: { slug: "hello" },
    pathname: "/posts/hello",
    query: {},
    hash: "",
  };
}

describe("runtime middleware", () => {
  it("runs middleware in match order and returns the downstream handler result", async () => {
    const calls: string[] = [];
    const match = createMatch();
    match.matches[0]!.module.middleware = [
      async (_context, next) => {
        calls.push("root:before");
        await next();
        calls.push("root:after");
      },
    ];
    match.matches[1]!.module.middleware = [
      async (_context, next) => {
        calls.push("posts:before");
        await next();
        calls.push("posts:after");
      },
    ];

    const result = await runWithRouteMiddleware(
      match,
      new Request("http://local/posts/hello"),
      "render",
      async () => {
        calls.push("handler");
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(calls).toEqual(["root:before", "posts:before", "handler", "posts:after", "root:after"]);
  });

  it("allows middleware to short-circuit with a response", async () => {
    const match = createMatch();
    match.matches[0]!.module.middleware = [
      async () =>
        new Response("blocked", {
          status: 403,
        }),
    ];

    const result = await runWithRouteMiddleware(
      match,
      new Request("http://local/posts/hello"),
      "action",
      async () => "unreachable",
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(await (result as Response).text()).toBe("blocked");
  });

  it("throws when next is called multiple times", async () => {
    const match = createMatch();
    match.matches[0]!.module.middleware = [
      async (_context, next) => {
        await next();
        await next();
      },
    ];

    await expect(
      runWithRouteMiddleware(
        match,
        new Request("http://local/posts/hello"),
        "render",
        async () => "ok",
      ),
    ).rejects.toThrow("middleware next() called multiple times");
  });
});
