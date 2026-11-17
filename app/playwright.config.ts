import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Prefer a preinstalled Chromium when the pinned browser isn't downloaded.
const exe = process.env.PW_CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "playwright-results.json" }], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    trace: "off",
    launchOptions: exe ? { executablePath: exe } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { NEXT_PUBLIC_CHAIN: "local" },
  },
});
