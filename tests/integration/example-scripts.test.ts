import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

describe("example script surface", () => {
  it("keeps dedicated scripts for the basic and todo showcase examples", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["example:basic"]).toBeTruthy();
    expect(packageJson.scripts?.["example:todo-app"]).toBeTruthy();
  });
});
