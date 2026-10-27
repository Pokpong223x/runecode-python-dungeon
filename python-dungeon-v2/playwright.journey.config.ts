import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Deliberately separate from the shorter regression suite: these start fresh
// and traverse every room through the actual browser UI and Python worker.
export default defineConfig({
  ...base,
  testDir: "tests/journey",
  timeout: 20 * 60 * 1000,
  maxFailures: 1,
  use: { ...base.use, reducedMotion: "reduce" },
  reporter: [
    ["list"],
    ["json", { outputFile: ".verification/full-campaign-results.json" }],
  ],
});
