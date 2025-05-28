import "@testing-library/jest-dom";
import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./mocks/server";

// Establish API mocking before all tests
beforeAll(() => server.listen());

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});

// Clean up after the tests are finished
afterAll(() => server.close());

// Mock window.electronAPI
Object.defineProperty(window, "electronAPI", {
  value: {
    getAppVersion: vi.fn().mockResolvedValue("1.0.0"),
    minimizeToTray: vi.fn().mockResolvedValue(undefined),
    showWindow: vi.fn().mockResolvedValue(undefined),
    onStartTimer: vi.fn(),
    onStopTimer: vi.fn(),
    onNewProject: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  writable: true,
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
