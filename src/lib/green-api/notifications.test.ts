import { describe, expect, it } from "vitest"

import { parseNotification } from "./notifications"

const instanceData = { idInstance: 4100000000, wid: "79876543210@c.us", typeInstance: "telegram" }

describe("parseNotification", () => {
  it("parses an incoming text message", () => {
    expect(
      parseNotification({
        typeWebhook: "incomingMessageReceived",
        instanceData,
        timestamp: 1763115112,
        idMessage: "126",
        senderData: { chatId: "10000000", chatName: "Василиса", sender: "10000000", senderName: "Василиса Премудрая" },
        messageData: { typeMessage: "textMessage", textMessageData: { textMessage: "Привет от Green-API!" } },
      }),
    ).toEqual({
      kind: "message",
      chatName: "Василиса",
      message: {
        id: "126",
        chatId: "10000000",
        direction: "incoming",
        text: "Привет от Green-API!",
        sentAt: 1763115112000,
        status: undefined,
        senderName: "Василиса Премудрая",
      },
    })
  })

  it("parses extended text and outgoing messages sent from the phone", () => {
    const event = parseNotification({
      typeWebhook: "outgoingMessageReceived",
      timestamp: 1,
      idMessage: "5",
      senderData: { chatId: "1", chatName: "Chat" },
      messageData: { typeMessage: "extendedTextMessage", extendedTextMessageData: { text: "https://green-api.com" } },
    })
    expect(event).toMatchObject({ kind: "message", message: { direction: "outgoing", text: "https://green-api.com", status: "sent" } })
  })

  it("ignores non-text messages", () => {
    expect(
      parseNotification({
        typeWebhook: "incomingMessageReceived",
        timestamp: 1,
        idMessage: "5",
        senderData: { chatId: "1" },
        messageData: { typeMessage: "imageMessage" },
      }),
    ).toEqual({ kind: "ignore" })
  })

  it("parses outgoing message statuses", () => {
    expect(
      parseNotification({
        typeWebhook: "outgoingMessageStatus",
        chatId: "10000000",
        instanceData,
        timestamp: 1755591519,
        idMessage: "115054445839974415",
        status: "read",
      }),
    ).toEqual({ kind: "status", chatId: "10000000", messageId: "115054445839974415", status: "read" })
  })

  it("parses instance state changes", () => {
    expect(parseNotification({ typeWebhook: "stateInstanceChanged", stateInstance: "notAuthorized" })).toEqual({
      kind: "state",
      state: "notAuthorized",
    })
  })

  it("ignores unknown notifications", () => {
    expect(parseNotification({ typeWebhook: "quotaExceeded" })).toEqual({ kind: "ignore" })
    expect(parseNotification(null)).toEqual({ kind: "ignore" })
  })
})

describe("parseNotification (replies)", () => {
  it("reads the text of a quoted reply", () => {
    expect(
      parseNotification({
        typeWebhook: "incomingMessageReceived",
        timestamp: 1588091580,
        idMessage: "F7AE",
        senderData: { chatId: "79001234567@c.us", sender: "79001234567@c.us", senderName: "Иван" },
        messageData: {
          typeMessage: "quotedMessage",
          extendedTextMessageData: { text: "Цитируем это", stanzaId: "4661", participant: "70009876543@c.us" },
        },
      }),
    ).toMatchObject({ kind: "message", message: { text: "Цитируем это", direction: "incoming" } })
  })
})

describe("parseNotification (edits, deletions, forwards)", () => {
  const envelope = {
    typeWebhook: "incomingMessageReceived",
    timestamp: 1,
    idMessage: "new-id",
    senderData: { chatId: "10000000", senderName: "Иван" },
  }

  it("parses an edited message", () => {
    expect(
      parseNotification({
        ...envelope,
        messageData: { typeMessage: "editedMessage", editedMessageData: { textMessage: "Новый текст", stanzaId: "115" } },
      }),
    ).toEqual({ kind: "edit", chatId: "10000000", messageId: "115", text: "Новый текст" })
  })

  it("parses a deleted message", () => {
    expect(
      parseNotification({ ...envelope, messageData: { typeMessage: "deletedMessage", deletedMessageData: { stanzaId: "115" } } }),
    ).toEqual({ kind: "delete", chatId: "10000000", messageId: "115" })
  })

  it("marks forwarded messages", () => {
    expect(
      parseNotification({
        ...envelope,
        messageData: {
          typeMessage: "textMessage",
          textMessageData: { textMessage: "Рекомендуем связаться…", isForwarded: true, forwardingScore: 1 },
        },
      }),
    ).toMatchObject({ kind: "message", message: { isForwarded: true } })
  })
})
