import { describe, expect, it } from "vitest";
import { createRouteLocationKey } from "../../../src/lib/router/location.ts";

describe("route location helpers", () => {
  it("builds a stable full path from pathname, query, and hash", () => {
    expect(
      createRouteLocationKey({
        pathname: "/posts/hello",
        query: {
          draft: "1",
          mode: "preview",
        },
        hash: "#intro",
      }),
    ).toBe("/posts/hello?draft=1&mode=preview#intro");
  });

  it("omits query and hash when they are empty", () => {
    expect(
      createRouteLocationKey({
        pathname: "/posts/hello",
        query: {},
        hash: "",
      }),
    ).toBe("/posts/hello");
  });
});
