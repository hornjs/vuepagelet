import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import {
  createRouteResolver,
  createVuePageRouteRecords,
  resolveNavigationLocation,
} from "../../../src/lib/router/matcher.ts";
import { createPageRouteMeta, resolvePageRouteRecord } from "../../../src/lib/router/router.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";

function createRoutes(): PageRouteRecord[] {
  const component = defineComponent({
    name: "RouteComponent",
    setup() {
      return () => null;
    },
  });

  return [
    {
      id: "root",
      path: "/",
      module: {
        component,
      },
      children: [
        {
          id: "posts",
          path: "posts",
          module: {
            component,
          },
          children: [
            {
              id: "post-detail",
              path: ":slug",
              module: {
                component,
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

describe("router matcher helpers", () => {
  it("creates a route resolver that resolves routes, locations, and vue route records", () => {
    const routes = createRoutes();
    const resolver = createRouteResolver(routes);
    const location = resolver.resolveLocation("http://local/posts/hello?draft=1#intro");

    expect(resolver.resolve("http://local/posts/hello")?.route.id).toBe("post-detail");
    expect(location).not.toBeNull();
    expect(location?.path).toBe("/posts/hello");
    expect(location?.fullPath).toBe("/posts/hello?draft=1#intro");
    expect(location?.params).toEqual({
      slug: "hello",
    });
    expect(location?.query).toEqual({
      draft: "1",
    });
    expect(location?.hash).toBe("#intro");
    expect(location?.matched.map((route) => route.id)).toEqual(["root", "posts", "post-detail"]);
    expect(resolver.toVueRoutes()).toHaveLength(1);
  });

  it("creates vue route records with route meta and resolves route records back from matched meta", () => {
    const routes = createRoutes();
    const vueRoutes = createVuePageRouteRecords(routes);

    expect(vueRoutes[0]?.name).toBe("root");
    expect(vueRoutes[0]?.children?.[0]?.name).toBe("posts");
    expect(vueRoutes[0]?.children?.[0]?.children?.[0]?.name).toBe("post-detail");
    expect(createPageRouteMeta(routes[0]!)).toEqual({
      pageRouteRecord: routes[0],
    });

    expect(
      resolvePageRouteRecord({
        matched: [
          {
            meta: createPageRouteMeta(routes[0]!),
          },
          {
            meta: createPageRouteMeta(routes[0]!.children[0]!),
          },
          {
            meta: createPageRouteMeta(routes[0]!.children[0]!.children[0]!),
          },
        ],
      } as never),
    ).toBe(routes[0]!.children[0]!.children[0]!);
  });
});
