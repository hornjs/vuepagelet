import { renderToString } from "@vue/server-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import {
  createStateStore,
  initializeClientStateStore,
  serializeStateStore,
  stateStoreKey,
  useState,
} from "../../../../src/lib/dom/composables/use-state.ts";

describe("useState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares keyed state inside the same injected store and serializes the final values", async () => {
    const store = createStateStore();
    let snapshot: number | null = null;

    const Probe = defineComponent({
      name: "StateProbe",
      setup() {
        const counter = useState<number>("counter", () => 1);
        const sameCounter = useState<number>("counter", () => 99);
        sameCounter.value += 1;
        snapshot = counter.value;

        return () => h("div", `counter: ${counter.value}`);
      },
    });

    const app = createSSRApp(Probe);
    app.provide(stateStoreKey, store);
    const html = await renderToString(app);

    expect(html).toContain("counter: 2");
    expect(snapshot).toBe(2);
    expect(serializeStateStore(store)).toEqual({
      counter: 2,
    });
  });

  it("falls back to the initialized client store outside setup on the client", () => {
    vi.stubGlobal("window", {} as Window);
    initializeClientStateStore({
      locale: "en-US",
    });

    const locale = useState<string>("locale");
    locale.value = "zh-CN";

    expect(useState<string>("locale").value).toBe("zh-CN");
  });
});
