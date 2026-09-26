import { describe, expect, it } from "vitest"

import { FAKE_CREDENTIALS } from "@/test/fake-green-api"
import { mockGreenApi } from "@/test/msw"

import { getSettingsIssues, LoginError, settingsFix, verifyInstance } from "./instance"

const credentials = { ...FAKE_CREDENTIALS, messenger: "telegram" as const }

describe("verifyInstance", () => {
  it("returns settings of an authorized instance", async () => {
    mockGreenApi()
    await expect(verifyInstance(credentials)).resolves.toMatchObject({ typeInstance: "telegram" })
  })

  it("rejects a not authorized instance", async () => {
    const api = mockGreenApi()
    api.stateInstance = "notAuthorized"

    await expect(verifyInstance(credentials)).rejects.toMatchObject({
      field: "root",
      message: expect.stringMatching(/не авторизован/),
    })
  })

  it("points to the token field on 401", async () => {
    mockGreenApi()
    const error = await verifyInstance({ ...credentials, apiTokenInstance: "bad" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LoginError)
    expect(error).toMatchObject({ field: "apiTokenInstance" })
  })

  it("detects a messenger mismatch", async () => {
    const api = mockGreenApi()
    api.settings.typeInstance = "whatsapp"

    await expect(verifyInstance(credentials)).rejects.toMatchObject({
      field: "messenger",
      message: expect.stringMatching(/Это инстанс WhatsApp/),
    })
  })
})

describe("getSettingsIssues", () => {
  it("returns nothing for a properly configured instance", () => {
    expect(getSettingsIssues({ webhookUrl: "", incomingWebhook: "yes", outgoingWebhook: "yes" })).toEqual([])
  })

  it("flags webhookUrl and disabled notifications", () => {
    const issues = getSettingsIssues({
      webhookUrl: "https://example.com",
      incomingWebhook: "no",
      outgoingWebhook: "no",
      outgoingMessageWebhook: "no",
    })
    expect(issues.map((issue) => issue.critical)).toEqual([true, true, false, false])
  })
})

describe("settingsFix", () => {
  it("adds edit/delete webhooks only when the instance knows them", () => {
    expect(settingsFix({ incomingWebhook: "no" })).not.toHaveProperty("editedMessageWebhook")
    expect(settingsFix({ editedMessageWebhook: "no", deletedMessageWebhook: "no" })).toMatchObject({
      editedMessageWebhook: "yes",
      deletedMessageWebhook: "yes",
      incomingWebhook: "yes",
      webhookUrl: "",
    })
  })
})
