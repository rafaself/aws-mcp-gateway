import { afterAll } from "vitest";

const origFetch = globalThis.fetch;

globalThis.fetch = () => {
  throw new Error(
    "Network request detected during unit test. "
    + "All HTTP requests must be mocked for offline and deterministic tests. "
    + "Use vi.mock() to mock modules that make network calls (e.g., aws4fetch).",
  );
};

afterAll(() => {
  globalThis.fetch = origFetch;
});
