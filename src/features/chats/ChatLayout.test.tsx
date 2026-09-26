import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import type { FakeGreenApi } from "@/test/fake-green-api"
import { mockGreenApi } from "@/test/msw"
import { findChatItem, findMessage, getChatItem, getMessage, queryMessage } from "@/test/queries"
import { logIn, renderApp } from "@/test/render"

const IVAN = { chatId: "10000000", name: "Иван Иванов", phoneNumber: 79991234567, username: "@ivan" }
const MARIA = { chatId: "20000000", name: "Мария", phoneNumber: 79997654321 }

async function openChat(user: ReturnType<typeof userEvent.setup>, chatId: string) {
  await user.click(await findChatItem(chatId))
  await screen.findByTestId("message-list")
}

describe("chat", () => {
  let api: FakeGreenApi

  beforeEach(() => {
    api = mockGreenApi()
    api.addContact(IVAN)
    api.addContact(MARIA)
    api.addHistory(IVAN.chatId, { type: "incoming", timestamp: 1_700_000_000, textMessage: "Привет!", senderName: IVAN.name })
    logIn()
  })

  it("lists chats with the last message preview", async () => {
    renderApp()

    const ivan = await findChatItem(IVAN.chatId)
    expect(within(ivan).getByTestId("chat-item-name")).toHaveTextContent("Иван Иванов")
    expect(within(ivan).getByTestId("chat-item-preview")).toHaveTextContent("Привет!")
    expect(within(getChatItem(MARIA.chatId)).getByTestId("chat-item-name")).toHaveTextContent("Мария")
  })

  it("opens a chat, sends a message and shows the reply", async () => {
    const user = userEvent.setup()
    renderApp()

    await openChat(user, IVAN.chatId)
    expect(await findMessage("Привет!")).toHaveAttribute("data-direction", "incoming")

    await user.type(screen.getByTestId("message-input"), "Как дела?{Enter}")

    expect(await findMessage("Как дела?")).toHaveAttribute("data-direction", "outgoing")
    await waitFor(() => expect(api.sent).toEqual([{ chatId: IVAN.chatId, message: "Как дела?" }]))
    await waitFor(() => expect(getMessage("Как дела?")).toHaveAttribute("data-status", "sent"))

    api.receiveText(IVAN.chatId, "Отлично, спасибо!")

    expect(await findMessage("Отлично, спасибо!")).toHaveAttribute("data-direction", "incoming")
    await waitFor(() => expect(api.pendingNotifications).toBe(0))
  })

  it("counts unread messages of inactive chats", async () => {
    renderApp()
    const maria = await findChatItem(MARIA.chatId)

    api.receiveText(MARIA.chatId, "Ты тут?")

    await waitFor(() => expect(within(maria).getByTestId("chat-item-unread")).toHaveTextContent("1"))
    expect(within(maria).getByTestId("chat-item-preview")).toHaveTextContent("Ты тут?")
  })

  it("marks a failed message and resends it", async () => {
    const user = userEvent.setup()
    api.sendMessageError = 500
    renderApp()

    await openChat(user, IVAN.chatId)
    await findMessage("Привет!")
    await user.type(screen.getByTestId("message-input"), "Не дойдёт{Enter}")

    await waitFor(() => expect(getMessage("Не дойдёт")).toHaveAttribute("data-status", "failed"))

    api.sendMessageError = null
    await user.click(within(getMessage("Не дойдёт")).getByTestId("message-retry"))

    await waitFor(() => expect(getMessage("Не дойдёт")).toHaveAttribute("data-status", "sent"))
    expect(screen.queryByTestId("message-retry")).not.toBeInTheDocument()
    expect(api.sent).toEqual([{ chatId: IVAN.chatId, message: "Не дойдёт" }])
  })

  it("creates a new chat by phone number", async () => {
    const user = userEvent.setup()
    api.addContact({ chatId: "30000000", name: "Пётр", phoneNumber: 79990001122 }, { inChatList: false })
    renderApp()

    await user.click(await screen.findByTestId("new-chat-button"))
    await user.type(await screen.findByTestId("new-chat-input"), "+7 999 000-11-22")
    await user.click(screen.getByTestId("new-chat-submit"))

    expect(await screen.findByTestId("chat-window")).toHaveAttribute("data-chat-id", "30000000")
    expect(await screen.findByTestId("chat-header-name")).toHaveTextContent("Пётр")
    expect(within(getChatItem("30000000")).getByTestId("chat-item-name")).toHaveTextContent("Пётр")
    expect(screen.queryByTestId("new-chat-dialog")).not.toBeInTheDocument()
  })

  it("shows an error when the number has no account", async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByTestId("new-chat-button"))
    await user.type(await screen.findByTestId("new-chat-input"), "79990000000")
    await user.click(screen.getByTestId("new-chat-submit"))

    expect(await screen.findByTestId("new-chat-error")).toHaveTextContent("У этого номера нет аккаунта Telegram")
  })

  it("adds a chat for a message from an unknown contact", async () => {
    renderApp()
    await findChatItem(IVAN.chatId)

    api.addContact({ chatId: "40000000", name: "Незнакомец", phoneNumber: 79995556677 }, { inChatList: false })
    api.receiveText("40000000", "Здравствуйте")

    const stranger = await findChatItem("40000000")
    expect(within(stranger).getByTestId("chat-item-name")).toHaveTextContent("Незнакомец")
    expect(within(stranger).getByTestId("chat-item-preview")).toHaveTextContent("Здравствуйте")
    expect(queryMessage("Здравствуйте")).toBeNull()
  })

  it("warns about wrong instance settings and fixes them", async () => {
    const user = userEvent.setup()
    api.settings.incomingWebhook = "no"
    renderApp()

    expect(await screen.findByTestId("settings-issue")).toHaveTextContent("Выключены уведомления о входящих сообщениях")
    await user.click(screen.getByTestId("fix-settings"))

    await waitFor(() => expect(api.settings.incomingWebhook).toBe("yes"))
    await waitFor(() => expect(screen.queryByTestId("settings-alert")).not.toBeInTheDocument())
    expect(await screen.findByTestId("toast-settings-saved")).toBeInTheDocument()
  })

  it("restores unread counters after a reload and marks the chat read on open", async () => {
    const user = userEvent.setup()
    const first = renderApp()

    // "Привет!" from the beforeEach is still unread in the messenger.
    const ivan = await findChatItem(IVAN.chatId)
    await waitFor(() => expect(within(ivan).getByTestId("chat-item-unread")).toHaveTextContent("1"))

    await user.click(ivan)
    await waitFor(() => expect(api.readChatCalls).toEqual([{ chatId: IVAN.chatId }]))
    expect(within(getChatItem(IVAN.chatId)).queryByTestId("chat-item-unread")).not.toBeInTheDocument()

    // Reload: the counter comes from the server again and is gone now.
    first.unmount()
    renderApp()
    const reloaded = await findChatItem(IVAN.chatId)
    await waitFor(() => expect(within(reloaded).getByTestId("chat-item-preview")).toHaveTextContent("Привет!"))
    expect(within(reloaded).queryByTestId("chat-item-unread")).not.toBeInTheDocument()
  })

  it("marks messages arriving in the open chat as read", async () => {
    const user = userEvent.setup()
    renderApp()
    await openChat(user, IVAN.chatId)

    const idMessage = api.receiveText(IVAN.chatId, "Сразу прочитано")

    await findMessage("Сразу прочитано")
    await waitFor(() => expect(api.readChatCalls).toContainEqual({ chatId: IVAN.chatId, idMessage }))
    expect(within(getChatItem(IVAN.chatId)).queryByTestId("chat-item-unread")).not.toBeInTheDocument()
  })

  it("shows edited, deleted and forwarded messages", async () => {
    const user = userEvent.setup()
    api.addHistory(IVAN.chatId, {
      type: "incoming",
      timestamp: 1_700_000_100,
      textMessage: "Рекомендуем связаться…",
      isForwarded: true,
    })
    renderApp()
    await openChat(user, IVAN.chatId)

    const forwarded = await findMessage("Рекомендуем связаться…")
    expect(forwarded).toHaveAttribute("data-forwarded", "true")
    expect(within(forwarded).getByTestId("message-forwarded")).toBeInTheDocument()

    const edited = api.receiveText(IVAN.chatId, "Опечатка")
    await findMessage("Опечатка")
    api.editText(IVAN.chatId, edited, "Исправлено")
    await waitFor(() => expect(getMessage("Исправлено")).toHaveAttribute("data-edited", "true"))
    expect(within(getMessage("Исправлено")).getByTestId("message-edited")).toHaveTextContent("изменено")
    expect(queryMessage("Опечатка")).toBeNull()

    const deleted = api.receiveText(IVAN.chatId, "Удали меня")
    await findMessage("Удали меня")
    api.deleteMessage(IVAN.chatId, deleted)
    // Deleted messages stay in the chat, marked as deleted.
    await waitFor(() => expect(getMessage("Удали меня")).toHaveAttribute("data-deleted", "true"))
    expect(within(getMessage("Удали меня")).getByTestId("message-deleted")).toHaveTextContent("удалено")
    expect(within(getChatItem(IVAN.chatId)).getByTestId("chat-item-preview")).toHaveAttribute("data-deleted", "true")
  })

  it("does not show a connecting state once the chats are loaded", async () => {
    renderApp()
    await findChatItem(IVAN.chatId)
    expect(screen.getByTestId("sidebar-title")).toHaveTextContent("Чаты Telegram")
  })

  it("keeps channels out of the list even when they send messages", async () => {
    const NEWS = { chatId: "-1001", name: "Новости", phoneNumber: 0, type: "channel" }
    const OTHER_NEWS = { chatId: "-1002", name: "Ещё канал", phoneNumber: 0, type: "channel" }
    api.addContact(NEWS)
    api.addContact(OTHER_NEWS, { inChatList: false })
    renderApp()
    await findChatItem(IVAN.chatId)
    expect(screen.queryByTestId(`chat-item-${NEWS.chatId}`)).not.toBeInTheDocument()

    // Notifications carry senderData.chatType: "channel" — both for a channel from getChats
    // and for one the list has never seen.
    api.receiveText(NEWS.chatId, "Пост в канале")
    api.receiveText(OTHER_NEWS.chatId, "Пост в другом канале")
    // A regular message after them proves the notifications were processed.
    api.receiveText(MARIA.chatId, "Контрольное")

    await waitFor(() =>
      expect(within(getChatItem(MARIA.chatId)).getByTestId("chat-item-preview")).toHaveTextContent("Контрольное"),
    )
    await waitFor(() => expect(api.pendingNotifications).toBe(0))
    expect(screen.queryByTestId(`chat-item-${NEWS.chatId}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`chat-item-${OTHER_NEWS.chatId}`)).not.toBeInTheDocument()
  })

  describe("chat in the URL", () => {
    it("puts the selected chat into the hash", async () => {
      const user = userEvent.setup()
      renderApp()

      await openChat(user, IVAN.chatId)
      expect(window.location.hash).toBe(`#${IVAN.chatId}`)

      await user.click(getChatItem(MARIA.chatId))
      expect(window.location.hash).toBe(`#${MARIA.chatId}`)
    })

    it("opens the chat from the hash on load and marks it read once", async () => {
      window.history.replaceState(null, "", `/#${IVAN.chatId}`)
      renderApp()

      expect(await screen.findByTestId("chat-window")).toHaveAttribute("data-chat-id", IVAN.chatId)
      expect(await findMessage("Привет!")).toBeInTheDocument()
      await waitFor(() => expect(api.readChatCalls).toContainEqual({ chatId: IVAN.chatId }))
      // Rendered in StrictMode: the double effect must not call readChat twice (1 req/s limit).
      expect(api.readChatCalls).toHaveLength(1)
    })

    it("restores a chat from the hash that getChats doesn't list yet", async () => {
      const PETR = { chatId: "30000000", name: "Пётр", phoneNumber: 79990001122 }
      api.addContact(PETR, { inChatList: false })
      window.history.replaceState(null, "", `/#${PETR.chatId}`)
      renderApp()

      expect(await screen.findByTestId("chat-window")).toHaveAttribute("data-chat-id", PETR.chatId)
      expect(await screen.findByTestId("chat-header-name")).toHaveTextContent("Пётр")
      expect(within(await findChatItem(PETR.chatId)).getByTestId("chat-item-name")).toHaveTextContent("Пётр")
    })

    it("follows browser navigation", async () => {
      const user = userEvent.setup()
      renderApp()
      await openChat(user, IVAN.chatId)

      window.history.replaceState(null, "", "/")
      window.dispatchEvent(new PopStateEvent("popstate"))
      await waitFor(() => expect(screen.queryByTestId("chat-window")).not.toBeInTheDocument())
      expect(screen.getByTestId("no-chat-selected")).toBeInTheDocument()

      window.history.replaceState(null, "", `/#${MARIA.chatId}`)
      window.dispatchEvent(new PopStateEvent("popstate"))
      expect(await screen.findByTestId("chat-window")).toHaveAttribute("data-chat-id", MARIA.chatId)
    })

    it("keeps WhatsApp ids readable", async () => {
      const user = userEvent.setup()
      api.addContact({ chatId: "79990001122@c.us", name: "WhatsApp", phoneNumber: 79990001122 })
      renderApp()

      await openChat(user, "79990001122@c.us")
      expect(window.location.hash).toBe("#79990001122@c.us")
    })

    it("clears the hash on logout", async () => {
      const user = userEvent.setup()
      renderApp()
      await openChat(user, IVAN.chatId)

      await user.click(screen.getByTestId("sidebar-menu"))
      await user.click(await screen.findByTestId("logout"))

      expect(await screen.findByTestId("login-form")).toBeInTheDocument()
      expect(window.location.hash).toBe("")
    })
  })

  it("does not count old notifications replayed from the queue as unread", async () => {
    renderApp()
    const maria = await findChatItem(MARIA.chatId)

    // The queue keeps notifications for 24h; this one is from before the app was opened.
    api.receiveText(MARIA.chatId, "Вчерашнее", { sentAt: Date.now() - 60 * 60_000 })
    await waitFor(() => expect(within(maria).getByTestId("chat-item-preview")).toHaveTextContent("Вчерашнее"))
    expect(within(maria).queryByTestId("chat-item-unread")).not.toBeInTheDocument()

    api.receiveText(MARIA.chatId, "Свежее")
    await waitFor(() => expect(within(maria).getByTestId("chat-item-unread")).toHaveTextContent("1"))
  })

  it("logs out", async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByTestId("sidebar-menu"))
    await user.click(await screen.findByTestId("logout"))

    expect(await screen.findByTestId("login-form")).toBeInTheDocument()
    expect(localStorage.getItem("green-api-chat:credentials")).toBeNull()
  })
})
