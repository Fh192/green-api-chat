import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { FAKE_CREDENTIALS } from "@/test/fake-green-api"
import { mockGreenApi, server } from "@/test/msw"

import { buildMethodUrl, createGreenApiClient } from "./client"
import { describeError, GreenApiError } from "./errors"

const credentials = { ...FAKE_CREDENTIALS, messenger: "telegram" as const }

describe("buildMethodUrl", () => {
  it("builds the GREEN-API method URL and trims trailing slashes", () => {
    expect(buildMethodUrl({ ...credentials, apiUrl: "https://4100.api.green-api.com/" }, "sendMessage")).toBe(
      "https://4100.api.green-api.com/waInstance4100123456/sendMessage/secret-token",
    )
  })

  it("appends the path suffix (receiptId)", () => {
    expect(buildMethodUrl(credentials, "deleteNotification", "42")).toMatch(/deleteNotification\/secret-token\/42$/)
  })
})

describe("createGreenApiClient", () => {
  it("sends a message and returns its id", async () => {
    const api = mockGreenApi()
    const client = createGreenApiClient(credentials)

    const result = await client.sendMessage("10000000", "Привет!")

    expect(result.idMessage).toEqual(expect.any(String))
    expect(api.sent).toEqual([{ chatId: "10000000", message: "Привет!" }])
  })

  it("receives and deletes notifications", async () => {
    const api = mockGreenApi()
    api.addContact({ chatId: "10000000", name: "Иван", phoneNumber: 79991234567 })
    api.receiveText("10000000", "Ответ")
    const client = createGreenApiClient(credentials)

    const notification = await client.receiveNotification(5)
    expect(notification?.body).toMatchObject({ typeWebhook: "incomingMessageReceived" })

    await client.deleteNotification(notification!.receiptId)
    expect(api.pendingNotifications).toBe(0)
  })

  it("returns null when the long poll times out", async () => {
    const api = mockGreenApi()
    api.receiveWaitMs = 10
    await expect(createGreenApiClient(credentials).receiveNotification(5)).resolves.toBeNull()
  })

  it("maps HTTP errors to GreenApiError", async () => {
    mockGreenApi()
    const client = createGreenApiClient({ ...credentials, apiTokenInstance: "wrong" })

    const error = await client.getStateInstance().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GreenApiError)
    expect((error as GreenApiError).status).toBe(401)
    expect(describeError(error)).toBe("Неверный idInstance или apiTokenInstance")
  })

  it("recognizes the webhook url error", async () => {
    const api = mockGreenApi()
    api.settings.webhookUrl = "https://example.com/hook"

    const error = await createGreenApiClient(credentials).receiveNotification(5).catch((e: unknown) => e)
    expect((error as GreenApiError).isWebhookUrlSet).toBe(true)
  })

  it("reports network failures with status 0", async () => {
    server.use(http.all(/waInstance/, () => HttpResponse.error()))

    const error = await createGreenApiClient(credentials).getSettings().catch((e: unknown) => e)
    expect((error as GreenApiError).status).toBe(0)
    expect((error as GreenApiError).isRetryable).toBe(true)
  })

  it("rejects responses of unexpected shape", async () => {
    server.use(http.all(/waInstance/, () => HttpResponse.json({ nope: true })))

    await expect(createGreenApiClient(credentials).sendMessage("1", "x")).rejects.toThrow(/Неожиданный ответ/)
  })

  it("skips unknown items in lists instead of failing", async () => {
    server.use(
      http.all(/getChatHistory/, () =>
        HttpResponse.json([
          { type: "incoming", idMessage: "1", timestamp: 1, typeMessage: "textMessage", chatId: "1", textMessage: "ok" },
          { garbage: true },
        ]),
      ),
    )

    await expect(createGreenApiClient(credentials).getChatHistory("1", 10)).resolves.toHaveLength(1)
  })
})
