import { describe, expect, it } from "vitest";
import * as AppApi from "../../src/lib/app.ts";

describe("app api exports", () => {
  it("re-exports the usage-facing runtime and dom helpers", () => {
    expect(AppApi.defer).toBeTypeOf("function");
    expect(AppApi.RouterLink).toBeTruthy();
    expect(AppApi.RouterView).toBeTruthy();
    expect(AppApi.renderRouteTree).toBeTypeOf("function");
    expect(AppApi.useActionData).toBeTypeOf("function");
    expect(AppApi.useDeferredData).toBeTypeOf("function");
    expect(AppApi.useDeferredError).toBeTypeOf("function");
    expect(AppApi.useLoaderData).toBeTypeOf("function");
    expect(AppApi.useRouteLoaderData).toBeTypeOf("function");
    expect(AppApi.useNavigation).toBeTypeOf("function");
    expect(AppApi.useCurrentPageRoute).toBeTypeOf("function");
    expect(AppApi.usePageRoute).toBeTypeOf("function");
    expect(AppApi.useRoute).toBeTypeOf("function");
    expect(AppApi.useRouter).toBeTypeOf("function");
    expect(AppApi.useFetcher).toBeTypeOf("function");
    expect(AppApi.useFormAction).toBeTypeOf("function");
    expect(AppApi.useSubmit).toBeTypeOf("function");
  });
});
