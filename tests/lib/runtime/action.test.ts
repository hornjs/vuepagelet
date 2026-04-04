import { describe, expect, it } from "vitest";
import { executeActionForMatch, executeMatchedAction } from "../../../src/lib/runtime/action.ts";
import type { PageRouteMatch, PageRouteRecord } from "../../../src/lib/router/types.ts";

describe("runtime action helpers", () => {
  it("returns null when no matched route declares an action", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {},
        children: [
          {
            id: "posts",
            path: "posts/:slug",
            module: {},
            children: [],
          },
        ],
      },
    ];

    const request = new Request("http://local/posts/hello", {
      method: "POST",
    });

    expect(await executeMatchedAction(request, routes)).toBeNull();
  });

  it("returns response results directly from the nearest matched action", async () => {
    const leaf: PageRouteRecord = {
      id: "post-detail",
      path: ":slug",
      module: {
        action: async () =>
          new Response("created", {
            status: 201,
          }),
      },
      children: [],
    };
    const match: PageRouteMatch = {
      route: leaf,
      matches: [
        {
          id: "root",
          path: "/",
          module: {},
          children: [],
        },
        leaf,
      ],
      params: { slug: "hello" },
      pathname: "/posts/hello",
      query: {},
      hash: "",
    };

    const result = await executeActionForMatch(
      new Request("http://local/posts/hello", {
        method: "POST",
      }),
      match,
    );

    expect(result?.route.id).toBe("post-detail");
    expect(result?.response).toBeInstanceOf(Response);
    expect(result?.data).toBeUndefined();
    expect(await result?.response?.text()).toBe("created");
  });
});
