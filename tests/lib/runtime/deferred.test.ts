import { describe, expect, it } from "vitest";
import {
  collectResolvedDeferredChunks,
  defer,
  encodeDeferredChunk,
  isDeferredData,
  iterateResolvedDeferredChunks,
  loadRouteData,
} from "../../../src/lib/runtime/deferred.ts";
import type { PageRouteMatch, PageRouteRecord } from "../../../src/lib/router/types.ts";

describe("runtime deferred helpers", () => {
  it("recognizes deferred payloads and encodes deferred chunks", () => {
    const payload = defer(
      {
        title: "critical",
      },
      {
        details: Promise.resolve("later"),
      },
    );

    expect(isDeferredData(payload)).toBe(true);
    expect(isDeferredData({ title: "critical" })).toBe(false);
    expect(
      encodeDeferredChunk({
        routeId: "post-detail",
        key: "details",
        data: "later",
      }),
    ).toEqual({
      type: "deferred",
      chunk: {
        routeId: "post-detail",
        key: "details",
        data: "later",
      },
    });
  });

  it("returns a response directly when a loader returns a response", async () => {
    const route: PageRouteRecord = {
      id: "root",
      path: "/",
      module: {
        loader: async () =>
          new Response("redirect", {
            status: 302,
          }),
      },
      children: [],
    };
    const match: PageRouteMatch = {
      route,
      matches: [route],
      params: {},
      pathname: "/",
      query: {},
      hash: "",
    };

    const loaded = await loadRouteData(match, new Request("http://local/"));

    expect(loaded).toBeInstanceOf(Response);
    expect((loaded as Response).status).toBe(302);
    expect(await (loaded as Response).text()).toBe("redirect");
  });

  it("resolves deferred chunks by completion order instead of declaration order", async () => {
    function createPending() {
      return [
        {
          routeId: "post-detail",
          key: "slow",
          promise: new Promise<{ routeId: string; key: string; data: string }>((resolve) => {
            setTimeout(() => {
              resolve({
                routeId: "post-detail",
                key: "slow",
                data: "slow",
              });
            }, 20);
          }),
        },
        {
          routeId: "post-detail",
          key: "fast",
          promise: Promise.resolve({
            routeId: "post-detail",
            key: "fast",
            data: "fast",
          }),
        },
      ];
    }

    const streamed: string[] = [];

    for await (const chunk of iterateResolvedDeferredChunks(createPending())) {
      streamed.push(chunk.key);
    }

    const collected = await collectResolvedDeferredChunks(createPending());

    expect(streamed).toEqual(["fast", "slow"]);
    expect(collected.map((chunk) => chunk.key)).toEqual(["fast", "slow"]);
  });

  it("stops collecting deferred chunks when the request signal aborts", async () => {
    const controller = new AbortController();
    let resolveSlow!: (value: { routeId: string; key: string; data: string }) => void;

    const pending = [
      {
        routeId: "post-detail",
        key: "slow",
        promise: new Promise<{ routeId: string; key: string; data: string }>((resolve) => {
          resolveSlow = resolve;
        }),
      },
    ];

    controller.abort();
    const collected = await collectResolvedDeferredChunks(pending, controller.signal);
    resolveSlow({
      routeId: "post-detail",
      key: "slow",
      data: "late",
    });

    expect(collected).toEqual([]);
  });
});
