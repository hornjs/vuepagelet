import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/integration.ts",
  ],
  platform: "neutral",
  dts: true,
  unbundle: true,
  tsconfig: true,
  fixedExtension: false,
  deps: {
    skipNodeModulesBundle: true,
  },
})
