import { test as base, type Page } from "@playwright/test"

import { FAKE_CREDENTIALS, FakeGreenApi } from "../src/test/fake-green-api.ts"

/** Serves every GREEN-API request of the page from an in-memory fake. */
export async function routeGreenApi(page: Page, api: FakeGreenApi) {
  await page.route(/\/waInstance\d+\//, async (route) => {
    const request = route.request()
    const response = await api.handle({
      url: request.url(),
      body: request.postData() ? request.postDataJSON() : undefined,
    })
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(response.body),
    })
  })
}

export const test = base.extend<{ api: FakeGreenApi }>({
  api: async ({ page }, provide) => {
    const api = new FakeGreenApi()
    api.receiveWaitMs = 500
    await routeGreenApi(page, api)
    await provide(api)
  },
})

export async function login(page: Page) {
  await page.goto("/")
  await page.getByTestId("login-api-url").fill(FAKE_CREDENTIALS.apiUrl)
  await page.getByTestId("login-id-instance").fill(FAKE_CREDENTIALS.idInstance)
  await page.getByTestId("login-api-token").fill(FAKE_CREDENTIALS.apiTokenInstance)
  await page.getByTestId("login-submit").click()
}

/** Message bubble containing the text. */
export function message(page: Page, text: string) {
  return page.getByTestId("message").filter({ has: page.getByTestId("message-text").filter({ hasText: text }) })
}

export { expect } from "@playwright/test"
