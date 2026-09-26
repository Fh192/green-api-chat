import { expect, login, message, routeGreenApi, test } from "./fixtures.ts"

const IVAN = { chatId: "10000000", name: "Иван Иванов", phoneNumber: 79991234567, username: "@ivan" }

test("full scenario from the task: login → new chat → send → reply", async ({ page, api }) => {
  api.addContact(IVAN, { inChatList: false })

  await login(page)
  await expect(page.getByTestId("chat-list-empty")).toBeVisible()

  // New chat by phone number
  await page.getByTestId("new-chat-button").click()
  await page.getByTestId("new-chat-input").fill("+7 999 123-45-67")
  await page.getByTestId("new-chat-submit").click()
  await expect(page.getByTestId("chat-window")).toHaveAttribute("data-chat-id", IVAN.chatId)
  await expect(page.getByTestId("chat-header-name")).toHaveText(IVAN.name)
  await expect(page.getByTestId(`chat-item-${IVAN.chatId}`).getByTestId("chat-item-name")).toHaveText(IVAN.name)

  // Send a message
  await page.getByTestId("message-input").fill("Привет из GREEN-API!")
  await page.getByTestId("message-input").press("Enter")
  await expect(message(page, "Привет из GREEN-API!")).toHaveAttribute("data-direction", "outgoing")
  await expect(message(page, "Привет из GREEN-API!")).toHaveAttribute("data-status", "sent")
  expect(api.sent).toEqual([{ chatId: IVAN.chatId, message: "Привет из GREEN-API!" }])

  // Recipient replies in Telegram
  api.receiveText(IVAN.chatId, "Привет! Получил 👋")
  await expect(message(page, "Привет! Получил 👋")).toHaveAttribute("data-direction", "incoming")
  await expect.poll(() => api.pendingNotifications).toBe(0)
})

test("session survives reload and logout clears it", async ({ page, api }) => {
  api.addContact(IVAN)
  api.addHistory(IVAN.chatId, { type: "incoming", timestamp: 1_700_000_000, textMessage: "Старое сообщение" })
  const ivan = page.getByTestId(`chat-item-${IVAN.chatId}`)

  await login(page)
  await expect(ivan).toBeVisible()

  await page.reload()
  await expect(ivan.getByTestId("chat-item-preview")).toHaveText("Старое сообщение")

  await page.getByTestId("sidebar-menu").click()
  await page.getByTestId("logout").click()
  await expect(page.getByTestId("login-form")).toBeVisible()

  await page.reload()
  await expect(page.getByTestId("login-form")).toBeVisible()
})

test("shows instance settings problems after login", async ({ page, api }) => {
  api.settings.webhookUrl = "https://example.com/webhook"

  await login(page)

  await expect(page.getByTestId("settings-issue")).toHaveText(
    "Задан webhookUrl, из-за него HTTP API не получает уведомления",
  )
  await page.getByTestId("fix-settings").click()
  await expect(page.getByTestId("toast-settings-saved")).toBeVisible()
  await expect(page.getByTestId("settings-alert")).toBeHidden()
  expect(api.settings.webhookUrl).toBe("")
})

test("selected chat lives in the URL: reload keeps it, Back closes it", async ({ page, api }) => {
  const MARIA = { chatId: "20000000", name: "Мария", phoneNumber: 79997654321 }
  api.addContact(IVAN)
  api.addContact(MARIA)

  await login(page)
  await page.getByTestId(`chat-item-${IVAN.chatId}`).click()
  await expect(page).toHaveURL(new RegExp(`#${IVAN.chatId}$`))

  // Back closes the chat (on mobile it returns to the list).
  await page.goBack()
  await expect(page.getByTestId("no-chat-selected")).toBeAttached()
  await expect(page).not.toHaveURL(/#/)

  await page.getByTestId(`chat-item-${MARIA.chatId}`).click()
  await expect(page).toHaveURL(new RegExp(`#${MARIA.chatId}$`))

  // Reload keeps the chat open.
  await page.reload()
  await expect(page.getByTestId("chat-window")).toHaveAttribute("data-chat-id", MARIA.chatId)

  // Forward/back work through history.
  await page.goBack()
  await expect(page.getByTestId("chat-window")).toBeHidden()
  await page.goForward()
  await expect(page.getByTestId("chat-window")).toHaveAttribute("data-chat-id", MARIA.chatId)
})

test("two tabs: one polls, both see incoming messages", async ({ page, api, context }) => {
  const MARIA = { chatId: "20000000", name: "Мария", phoneNumber: 79997654321 }
  api.addContact(IVAN)
  api.addContact(MARIA)

  await login(page)
  await expect(page.getByTestId(`chat-item-${IVAN.chatId}`)).toBeVisible()

  // Second tab of the same browser: the session comes from localStorage.
  const second = await context.newPage()
  await routeGreenApi(second, api)
  let secondTabPolls = 0
  second.on("request", (request) => {
    if (request.url().includes("/receiveNotification/")) secondTabPolls += 1
  })
  await second.goto("/")
  await expect(second.getByTestId(`chat-item-${IVAN.chatId}`)).toBeVisible()

  for (const [chatId, text] of [
    [IVAN.chatId, "Первое"],
    [MARIA.chatId, "Второе"],
    [IVAN.chatId, "Третье"],
  ]) {
    api.receiveText(chatId, text)
    for (const tab of [page, second]) {
      await expect(tab.getByTestId(`chat-item-${chatId}`).getByTestId("chat-item-preview")).toHaveText(text)
    }
  }
  await expect.poll(() => api.pendingNotifications).toBe(0)
  // Only the tab holding the lock polls; the other one gets events relayed.
  expect(secondTabPolls).toBe(0)
})

test("serves the production security headers", async ({ page }) => {
  const response = await page.goto("/")
  const headers = response!.headers()

  expect(headers["content-security-policy"]).toContain("connect-src 'self' https://*.green-api.com")
  expect(headers["x-content-type-options"]).toBe("nosniff")
})
