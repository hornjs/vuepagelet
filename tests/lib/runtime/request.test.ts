import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { handlePageRequest } from "../../../src/lib/runtime/request.ts";
import { parseRuntimePayload } from "../../../src/lib/runtime/serialization.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";

function createComponent(name: string, text = name) {
  return defineComponent({
    name,
    setup() {
      return () => h("div", text);
    },
  });
}

function createRoutes(): PageRouteRecord[] {
  const component = createComponent("RequestPage");

  return [
    {
      id: "root",
      path: "/",
      module: {
        component,
        loader: async () => ({ shell: true }),
      },
      children: [
        {
          id: "posts",
          path: "posts/:slug",
          module: {
            component,
            loader: async ({ params }) => ({ slug: params.slug }),
            action: async ({ params }) => ({ saved: params.slug }),
          },
          children: [],
        },
      ],
    },
  ];
}

describe("runtime request", () => {
  it("treats json navigation requests without a valid referer as a fresh load", async () => {
    const response = await handlePageRequest(
      new Request("http://local/posts/hello", {
        headers: {
          accept: "application/json",
          referer: "not a valid url",
        },
      }),
      {
        routes: createRoutes(),
        app: {
          loader: async () => ({ shell: "document" }),
        },
      },
    );

    expect(response.status).toBe(200);
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "posts",
      ok: true,
      status: 200,
      pathname: "/posts/hello",
      appData: {
        shell: "document",
      },
      revalidatedRouteIds: ["root", "posts"],
      loaderData: {
        root: { shell: true },
        posts: { slug: "hello" },
      },
      deferredData: {},
      pendingDeferredKeys: {},
      routeErrors: {},
    });
  });

  it("keeps html document responses for non-json action submissions", async () => {
    const response = await handlePageRequest(
      new Request("http://local/posts/hello", {
        method: "POST",
        body: new URLSearchParams({ title: "hello" }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "text/html",
        },
      }),
      {
        routes: createRoutes(),
      },
    );

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("__VUEPAGELET__");
    expect(html).toContain('saved:"hello"');
  });

  it("does not include appData in json navigation when app.shouldRevalidate returns false", async () => {
    const response = await handlePageRequest(
      new Request("http://local/posts/world", {
        headers: {
          accept: "application/json",
          referer: "http://local/posts/hello",
        },
      }),
      {
        routes: createRoutes(),
        app: {
          loader: async () => ({ shell: "document" }),
          shouldRevalidate() {
            return false;
          },
        },
      },
    );

    expect(response.status).toBe(200);
    expect(parseRuntimePayload(await response.text())).toEqual({
      routeId: "posts",
      ok: true,
      status: 200,
      pathname: "/posts/world",
      revalidatedRouteIds: ["posts"],
      loaderData: {
        posts: { slug: "world" },
      },
      deferredData: {},
      pendingDeferredKeys: {},
      routeErrors: {},
    });
  });
});
