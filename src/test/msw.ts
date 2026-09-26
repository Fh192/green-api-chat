import { http, HttpResponse, type JsonBodyType } from "msw"
import { setupServer } from "msw/node"

import { FakeGreenApi } from "./fake-green-api"

export const server = setupServer()

/** Routes every GREEN-API request of the test to a fresh fake instance. */
export function mockGreenApi() {
  const api = new FakeGreenApi()
  server.use(
    http.all(/\/waInstance\d+\//, async ({ request }) => {
      const text = await request.text()
      const response = await api.handle({
        url: request.url,
        body: text ? JSON.parse(text) : undefined,
      })
      return HttpResponse.json(response.body as JsonBodyType, { status: response.status })
    }),
  )
  return api
}
