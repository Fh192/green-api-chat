import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { FAKE_CREDENTIALS } from "@/test/fake-green-api"
import { mockGreenApi } from "@/test/msw"
import { findChatItem } from "@/test/queries"
import { renderApp } from "@/test/render"

async function fillForm(overrides: Partial<Record<keyof typeof FAKE_CREDENTIALS, string>> = {}) {
  const user = userEvent.setup()
  const values = { ...FAKE_CREDENTIALS, ...overrides }
  if (values.apiUrl) await user.type(screen.getByTestId("login-api-url"), values.apiUrl)
  if (values.idInstance) await user.type(screen.getByTestId("login-id-instance"), values.idInstance)
  if (values.apiTokenInstance) await user.type(screen.getByTestId("login-api-token"), values.apiTokenInstance)
  await user.click(screen.getByTestId("login-submit"))
}

describe("LoginScreen", () => {
  it("validates fields before calling the API", async () => {
    mockGreenApi()
    renderApp()

    await fillForm({ apiUrl: "not a url", idInstance: "41abc", apiTokenInstance: "" })

    expect(await screen.findByTestId("login-api-url-error")).toHaveTextContent(/Введите адрес вида/)
    expect(screen.getByTestId("login-id-instance-error")).toHaveTextContent("idInstance состоит только из цифр")
    expect(screen.getByTestId("login-api-token-error")).toHaveTextContent("Укажите apiTokenInstance")
  })

  it("logs in and stores credentials", async () => {
    const api = mockGreenApi()
    api.addContact({ chatId: "10000000", name: "Иван Иванов", phoneNumber: 79991234567 })
    renderApp()

    await fillForm()

    expect(await findChatItem("10000000")).toHaveTextContent("Иван Иванов")
    expect(JSON.parse(localStorage.getItem("green-api-chat:credentials")!)).toEqual({
      ...FAKE_CREDENTIALS,
      messenger: "telegram",
    })
  })

  it("shows the token error on 401", async () => {
    mockGreenApi()
    renderApp()

    await fillForm({ apiTokenInstance: "wrong" })

    expect(await screen.findByTestId("login-api-token-error")).toHaveTextContent(
      "Неверный idInstance или apiTokenInstance",
    )
    expect(localStorage.getItem("green-api-chat:credentials")).toBeNull()
  })

  it("explains that the instance is not authorized", async () => {
    const api = mockGreenApi()
    api.stateInstance = "notAuthorized"
    renderApp()

    await fillForm()

    expect(await screen.findByTestId("login-error")).toHaveTextContent(/Инстанс не авторизован/)
  })

  it("rejects an instance of another messenger", async () => {
    const api = mockGreenApi()
    api.settings.typeInstance = "v3"
    renderApp()

    await fillForm()

    expect(await screen.findByTestId("login-messenger-error")).toHaveTextContent(
      /Это инстанс MAX, а выбран Telegram/,
    )
  })

  it("suggests apiUrl from idInstance until it is edited by hand", async () => {
    mockGreenApi()
    const user = userEvent.setup()
    renderApp()

    await user.type(screen.getByTestId("login-id-instance"), "4100123456")
    expect(screen.getByTestId("login-api-url")).toHaveValue("https://4100.api.green-api.com")

    await user.clear(screen.getByTestId("login-api-url"))
    await user.type(screen.getByTestId("login-api-url"), "https://7107.api.greenapi.com")
    await user.type(screen.getByTestId("login-id-instance"), "7")
    expect(screen.getByTestId("login-api-url")).toHaveValue("https://7107.api.greenapi.com")
  })

  it("accepts only https", async () => {
    mockGreenApi()
    renderApp()

    await fillForm({ apiUrl: "http://4100.api.green-api.com" })

    expect(await screen.findByTestId("login-api-url-error")).toHaveTextContent(/Введите адрес вида/)
  })
})
