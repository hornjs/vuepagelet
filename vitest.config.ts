import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  optimizeDeps: {
    include: ["@vue/server-renderer"],
  },
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/lib/**/*.test.ts",
            "tests/integration/**/*.test.ts",
          ],
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          setupFiles: ["tests/browser/setup.ts"],
          browser: {
            enabled: true,
            headless: process.env.VITEST_BROWSER_HEADLESS !== "false",
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
