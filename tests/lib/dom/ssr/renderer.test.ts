import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { renderPageResponse } from "../../../../src/lib/dom/ssr/renderer.ts";
import type { PageRouteRecord } from "../../../../src/lib/router/types.ts";
import * as PublicApi from "../../../../src/index.ts";

function createComponent(name: string, text = name) {
  return defineComponent({
    name,
    setup() {
      return () => h("div", text);
    },
  });
}

describe("dom ssr renderer", () => {
  it("injects bootstrap payload and client entry script into document responses", async () => {
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: createComponent("RootPage", "hello from root"),
          loader: async () => ({ theme: "emerald" }),
        },
        children: [],
      },
    ];

    const response = await renderPageResponse({
      request: new Request("http://local/"),
      routes,
      clientEntryPath: "/examples/basic/client.ts",
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("hello from root");
    expect(html).toContain("__VUEPAGELET__");
    expect(html).toContain('theme:"emerald"');
    expect(html).toContain('type="module" src="/examples/basic/client.ts"');
  });

  it("returns not found when no route matches", async () => {
    const response = await renderPageResponse({
      request: new Request("http://local/missing"),
      routes: [],
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("renders the app shell as a document shell when provided", async () => {
    const AppShell = defineComponent({
      name: "AppShell",
      setup(_props, { slots }) {
        const appData = PublicApi.useAppData<{ theme: string }>();

        return () =>
          h("html", { lang: "en" }, [
            h("head", [h("title", "document shell")]),
            h("body", [h("div", `theme: ${appData.value?.theme ?? "missing"}`), slots.default?.()]),
          ]);
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: createComponent("RootPage", "hello from shell"),
        },
        children: [],
      },
    ];

    const response = await renderPageResponse({
      request: new Request("http://local/"),
      routes,
      app: {
        shell: AppShell,
        loader: async () => ({ theme: "document" }),
      },
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<html");
    expect(html).toContain("data-vuepagelet");
    expect(html).toContain("<title>document shell</title>");
    expect(html).toContain("theme: document");
    expect(html).toContain("hello from shell");
  });

  it("renders app.error when the app shell throws during render", async () => {
    const AppShell = defineComponent({
      name: "BrokenAppShell",
      setup() {
        return () => {
          throw new Error("app shell failed");
        };
      },
    });
    const AppError = defineComponent({
      name: "AppError",
      props: {
        error: {
          type: null,
          default: null,
        },
      },
      setup(props) {
        return () =>
          h("html", { lang: "en" }, [
            h("head", [h("title", "app error")]),
            h(
              "body",
              `app error: ${
                typeof props.error === "object" && props.error !== null && "message" in props.error
                  ? String((props.error as { message: string }).message)
                  : String(props.error)
              }`,
            ),
          ]);
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: createComponent("RootPage", "hello from root"),
        },
        children: [],
      },
    ];

    const response = await renderPageResponse({
      request: new Request("http://local/"),
      routes,
      app: {
        shell: AppShell,
        error: AppError,
      },
    });

    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain("<title>app error</title>");
    expect(html).toContain("app error: app shell failed");
  });

  it("serializes shared useState values into the bootstrap payload", async () => {
    const CounterPage = defineComponent({
      name: "CounterPage",
      setup() {
        const useState = (
          PublicApi as {
            useState: <T>(key: string, initialValue?: T | (() => T)) => { value: T };
          }
        ).useState;
        const counter = useState<number>("counter", () => 1);

        return () => h("div", `counter: ${counter.value}`);
      },
    });
    const routes: PageRouteRecord[] = [
      {
        id: "root",
        path: "/",
        module: {
          component: CounterPage,
        },
        children: [],
      },
    ];

    const response = await renderPageResponse({
      request: new Request("http://local/"),
      routes,
    });

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("counter: 1");
    expect(html).toContain("state:{counter:1}");
  });
});
