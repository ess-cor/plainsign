import { defineConfig } from "@playwright/test";

const sepoliaDemo = process.env.PLAIN_SIGN_E2E_DEMO_CHAIN === "11155111";
const demoAttacker = "0x3B497AE93753967D3eA96cf04a517C3da0e66003";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  reporter: process.env.CI ? [["github"], ["line"]] : "line",
  use: {
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/serve.js",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: true,
      timeout: 10_000,
    },
    {
      command: sepoliaDemo
        ? "npm --prefix demo-dapp run dev"
        : `cross-env ATTACKER_ADDRESS=${demoAttacker} npm run demo:local`,
      url: "http://127.0.0.1:5173",
      reuseExistingServer: true,
      timeout: sepoliaDemo ? 30_000 : 120_000,
    },
  ],
});
