import { describe, expect, it } from "vitest";
import {
  PageRouteExecutionError,
  assignNearestRouteError,
  deriveRouteErrors,
  isPageRouteExecutionError,
  normalizeRouteError,
  resolveNearestErrorBoundary,
} from "../../../src/lib/runtime/route-errors.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";

function createRoutes(): PageRouteRecord[] {
  return [
    {
      id: "root",
      path: "/",
      module: {
        error: {} as never,
      },
      children: [
        {
          id: "posts",
          path: "posts",
          module: {
            error: {} as never,
          },
          children: [
            {
              id: "post-detail",
              path: ":slug",
              module: {},
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

describe("route errors", () => {
  it("normalizes error objects and exposes PageRouteExecutionError metadata", () => {
    const cause = new Error("loader failed");
    const error = new PageRouteExecutionError({
      phase: "loader",
      routeId: "post-detail",
      error: cause,
      loaderData: {
        posts: { title: "posts" },
      },
      pending: [],
    });

    expect(isPageRouteExecutionError(error)).toBe(true);
    expect(error.phase).toBe("loader");
    expect(error.routeId).toBe("post-detail");
    expect(error.loaderData).toEqual({
      posts: { title: "posts" },
    });
    expect(error.error).toEqual(
      expect.objectContaining({
        name: "Error",
        message: "loader failed",
      }),
    );
    expect(normalizeRouteError("plain error")).toBe("plain error");
  });

  it("resolves and assigns the nearest error boundary", () => {
    const routes = createRoutes();
    const matches = [routes[0]!, routes[0]!.children[0]!, routes[0]!.children[0]!.children[0]!];

    expect(resolveNearestErrorBoundary(matches, "post-detail")?.id).toBe("posts");
    expect(resolveNearestErrorBoundary(matches, "posts")?.id).toBe("posts");
    expect(resolveNearestErrorBoundary(matches, "missing")).toBeNull();
    expect(
      assignNearestRouteError({
        routeErrors: {
          unrelated: { message: "keep me" },
        },
        matches,
        failedRouteId: "post-detail",
        error: new Error("render failed"),
      }),
    ).toEqual({
      unrelated: { message: "keep me" },
      posts: expect.objectContaining({
        message: "render failed",
      }),
    });
  });

  it("derives route errors from explicit route errors and deferred failures", () => {
    const routes = createRoutes();
    const matches = [routes[0]!, routes[0]!.children[0]!, routes[0]!.children[0]!.children[0]!];

    expect(
      deriveRouteErrors(matches, {
        routeErrors: {
          root: { message: "root failed" },
        },
        deferredErrors: {
          "post-detail": {
            slowBlock: new Error("deferred failed"),
          },
        },
      }),
    ).toEqual({
      root: { message: "root failed" },
      posts: expect.objectContaining({
        message: "deferred failed",
      }),
    });
  });
});
