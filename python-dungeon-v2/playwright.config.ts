import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: process.env.TEST_URL ?? "http://127.0.0.1:5173",
    headless: true,
    screenshot: "only-on-failure",
  },
  projects: [
    ...(process.env.WEBKIT_EXECUTABLE
      ? [
          {
            name: "webkit-local",
            use: {
              browserName: "webkit" as const,
              launchOptions: { executablePath: process.env.WEBKIT_EXECUTABLE },
            },
          },
        ]
      : []),
    {
      name: "chrome",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath:
            "C:/Program Files/Google/Chrome/Application/chrome.exe",
        },
      },
    },
    {
      name: "edge",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath:
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        },
      },
    },
    ...(process.env.ALL_BROWSERS
      ? [
          { name: "firefox", use: { browserName: "firefox" as const } },
          { name: "webkit", use: { browserName: "webkit" as const } },
        ]
      : []),
  ],
  reporter: "list",
});
