import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "./msw"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
  // The open chat lives in the URL hash; don't leak it into the next test.
  window.history.replaceState(null, "", "/")
})
afterAll(() => server.close())

// jsdom does not implement scrolling.
Element.prototype.scrollTo = function scrollTo() {}
