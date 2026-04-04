import { describe, expect, it } from "vitest";
import { pruneRouteStateMaps } from "../../../src/lib/runtime/route-state.ts";

describe("route state helpers", () => {
  it("prunes only the requested route ids from the provided maps", () => {
    const snapshot = pruneRouteStateMaps(["posts", "post-detail"], {
      loaderData: {
        root: { theme: "dark" },
        posts: { section: "posts" },
      },
      actionData: {
        root: { saved: true },
        "post-detail": { submitted: true },
      },
      deferredData: {
        "post-detail": {
          slowBlock: { title: "hello" },
        },
      },
      deferredErrors: {
        "post-detail": {
          slowBlock: { message: "failed" },
        },
      },
      pendingDeferredKeys: {
        "post-detail": ["slowBlock"],
      },
      routeErrors: {
        posts: { message: "layout failed" },
        root: { message: "root failed" },
      },
    });

    expect(snapshot.loaderData).toEqual({
      root: { theme: "dark" },
    });
    expect(snapshot.actionData).toEqual({
      root: { saved: true },
    });
    expect(snapshot.deferredData).toEqual({});
    expect(snapshot.deferredErrors).toEqual({});
    expect(snapshot.pendingDeferredKeys).toEqual({});
    expect(snapshot.routeErrors).toEqual({
      root: { message: "root failed" },
    });
  });

  it("keeps omitted maps undefined", () => {
    const snapshot = pruneRouteStateMaps(["posts"], {
      routeErrors: {
        root: { message: "root failed" },
      },
    });

    expect(snapshot.loaderData).toBeUndefined();
    expect(snapshot.actionData).toBeUndefined();
    expect(snapshot.routeErrors).toEqual({
      root: { message: "root failed" },
    });
  });
});
