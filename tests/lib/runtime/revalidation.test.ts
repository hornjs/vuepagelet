import { describe, expect, it } from "vitest";
import { defineComponent } from "vue";
import { matchPageRoute } from "../../../src/lib/router/matcher.ts";
import type { PageRouteRecord } from "../../../src/lib/router/types.ts";
import {
  createAppRevalidationPlan,
  createRevalidationPlan,
} from "../../../src/lib/runtime/revalidation.ts";
import type { AppModule } from "../../../src/lib/runtime/types.ts";

function createComponent(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => null;
    },
  });
}

function createRoutes(): PageRouteRecord[] {
  const component = createComponent("RevalidationPage");

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
          path: "posts",
          module: {
            loader: async () => ({ section: "posts" }),
            shouldRevalidate(args) {
              if (args.type === "action") {
                return args.formAction === "/posts/hello" && args.actionStatus === 201;
              }

              return args.defaultShouldRevalidate;
            },
          },
          children: [
            {
              id: "post-detail",
              path: ":slug",
              module: {
                component,
                loader: async ({ params }) => ({ slug: params.slug }),
              },
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

describe("runtime revalidation", () => {
  it("revalidates all matched loaders on first load", () => {
    const nextMatch = matchPageRoute("http://local/posts/hello", createRoutes());

    expect(nextMatch).not.toBeNull();

    const plan = createRevalidationPlan({
      currentMatch: null,
      nextMatch: nextMatch!,
      currentUrl: null,
      nextUrl: new URL("http://local/posts/hello"),
    });

    expect(plan.routeIds).toEqual(["root", "posts", "post-detail"]);
  });

  it("revalidates only the leaf loader when only params change on the same branch", () => {
    const routes = createRoutes();
    const currentMatch = matchPageRoute("http://local/posts/hello", routes);
    const nextMatch = matchPageRoute("http://local/posts/world", routes);

    expect(currentMatch).not.toBeNull();
    expect(nextMatch).not.toBeNull();

    const plan = createRevalidationPlan({
      currentMatch: currentMatch!,
      nextMatch: nextMatch!,
      currentUrl: new URL("http://local/posts/hello"),
      nextUrl: new URL("http://local/posts/world"),
    });

    expect(plan.routeIds).toEqual(["post-detail"]);
  });

  it("passes action metadata into route shouldRevalidate hooks", () => {
    const routes = createRoutes();
    const match = matchPageRoute("http://local/posts/hello", routes);

    expect(match).not.toBeNull();

    const plan = createRevalidationPlan({
      currentMatch: match!,
      nextMatch: match!,
      currentUrl: new URL("http://local/posts/hello"),
      nextUrl: new URL("http://local/posts/hello"),
      actionRouteId: "post-detail",
      formMethod: "POST",
      formAction: "/posts/hello",
      actionStatus: 201,
      actionResult: { saved: true },
    });

    expect(plan.routeIds).toEqual(["posts", "post-detail"]);
  });

  it("does not revalidate app loader by default for same-url action submissions", () => {
    const routes = createRoutes();
    const match = matchPageRoute("http://local/posts/hello", routes);
    const app: AppModule = {
      loader: async () => ({ theme: "app" }),
    };

    expect(match).not.toBeNull();

    const plan = createAppRevalidationPlan(app, {
      currentMatch: match!,
      nextMatch: match!,
      currentUrl: new URL("http://local/posts/hello"),
      nextUrl: new URL("http://local/posts/hello"),
      actionRouteId: "post-detail",
      formMethod: "POST",
      formAction: "/posts/hello",
      actionStatus: 200,
      actionResult: { saved: true },
    });

    expect(plan.shouldRevalidate).toBe(false);
  });

  it("allows app shouldRevalidate to opt app loader back in for action submissions", () => {
    const routes = createRoutes();
    const match = matchPageRoute("http://local/posts/hello", routes);
    const app: AppModule = {
      loader: async () => ({ theme: "app" }),
      shouldRevalidate(args) {
        return args.type === "action" && args.formAction === "/posts/hello";
      },
    };

    expect(match).not.toBeNull();

    const plan = createAppRevalidationPlan(app, {
      currentMatch: match!,
      nextMatch: match!,
      currentUrl: new URL("http://local/posts/hello"),
      nextUrl: new URL("http://local/posts/hello"),
      actionRouteId: "post-detail",
      formMethod: "POST",
      formAction: "/posts/hello",
      actionStatus: 200,
      actionResult: { saved: true },
    });

    expect(plan.shouldRevalidate).toBe(true);
  });
});
