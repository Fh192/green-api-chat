import { describe, expect, it, vi } from "vitest"

import type { GreenApiClient } from "./client"
import { messengerByTypeInstance, messengers, normalizeChat, normalizeMessages } from "./messengers"

function clientWithCheck(response: object) {
  const checkAccount = vi.fn().mockResolvedValue(response)
  return { client: { checkAccount } as unknown as GreenApiClient, checkAccount }
}

describe("normalizeChat", () => {
  it("normalizes a Telegram chat", () => {
    expect(
      normalizeChat({ chatId: "10000000", name: "Василиса", type: "user", phoneNumber: 79876543210, username: "@vasilisa" }),
    ).toEqual({
      chatId: "10000000",
      name: "Василиса",
      type: "user",
      phoneNumber: 79876543210,
      username: "@vasilisa",
      aliases: [],
    })
  })

  it("treats supergroups and negative ids as groups", () => {
    expect(normalizeChat({ chatId: "-100", name: "G", type: "supergroup" })?.type).toBe("group")
    expect(normalizeChat({ chatId: "-100", name: "G" })?.type).toBe("group")
  })

  it("hides channels", () => {
    expect(normalizeChat({ chatId: "-100", name: "News", type: "channel" })).toBeNull()
  })

  it("supports WhatsApp shape with id and newChatId", () => {
    expect(normalizeChat({ id: "79001234567@c.us", name: "", type: "user", newChatId: "123@lid" })).toMatchObject({
      chatId: "79001234567@c.us",
      name: "79001234567@c.us",
      aliases: ["123@lid"],
    })
  })

  it("falls back to username or phone for the name", () => {
    expect(normalizeChat({ chatId: "1", name: "", username: "@nick" })?.name).toBe("@nick")
    expect(normalizeChat({ chatId: "1", name: "", phoneNumber: 79990001122 })?.name).toBe("+79990001122")
  })
})

describe("normalizeMessages", () => {
  it("keeps text messages only, oldest first, in milliseconds", () => {
    const messages = normalizeMessages([
      { type: "outgoing", idMessage: "2", timestamp: 20, typeMessage: "extendedTextMessage", chatId: "1", extendedTextMessage: { text: "link" }, statusMessage: "read" },
      { type: "incoming", idMessage: "img", timestamp: 15, typeMessage: "imageMessage", chatId: "1" },
      { type: "incoming", idMessage: "1", timestamp: 10, typeMessage: "textMessage", chatId: "1", textMessage: "hi", senderName: "Ivan" },
    ])

    expect(messages).toEqual([
      { id: "1", chatId: "1", direction: "incoming", text: "hi", sentAt: 10_000, status: undefined, senderName: "Ivan" },
      { id: "2", chatId: "1", direction: "outgoing", text: "link", sentAt: 20_000, status: "read", senderName: undefined },
    ])
  })

  it("maps noAccount to failed and defaults outgoing status to sent", () => {
    const [failed, unknown] = normalizeMessages([
      { type: "outgoing", idMessage: "1", timestamp: 1, typeMessage: "textMessage", chatId: "1", textMessage: "a", statusMessage: "noAccount" },
      { type: "outgoing", idMessage: "2", timestamp: 2, typeMessage: "textMessage", chatId: "1", textMessage: "b" },
    ])
    expect(failed.status).toBe("failed")
    expect(unknown.status).toBe("sent")
  })
})

describe("messenger adapters", () => {
  it("finds the adapter by typeInstance", () => {
    expect(messengerByTypeInstance("telegram")?.id).toBe("telegram")
    expect(messengerByTypeInstance("v3")?.id).toBe("max")
    expect(messengerByTypeInstance("whatsapp")?.id).toBe("whatsapp")
    expect(messengerByTypeInstance(undefined)).toBeUndefined()
  })

  it("Telegram uses checkAccount and returns the chatId", async () => {
    const { client, checkAccount } = clientWithCheck({ exist: true, chatId: "10000000", username: "@ivan", phoneNumber: 79991234567 })

    await expect(messengers.telegram.checkAccount(client, { phoneNumber: 79991234567 })).resolves.toEqual({
      exists: true,
      chatId: "10000000",
      aliases: [],
      phoneNumber: 79991234567,
      username: "@ivan",
    })
    expect(checkAccount).toHaveBeenCalledWith("checkAccount", { phoneNumber: 79991234567 })
  })

  it("reports a missing account", async () => {
    const { client } = clientWithCheck({ exist: false, chatId: "" })
    await expect(messengers.max.checkAccount(client, { phoneNumber: 79991234567 })).resolves.toMatchObject({ exists: false })
  })

  it("throws when the instance is not authorized", async () => {
    const { client } = clientWithCheck({ status: false, reason: "instance is starting or not authorized" })
    await expect(messengers.telegram.checkAccount(client, { phoneNumber: 79991234567 })).rejects.toThrow("not authorized")
  })

  it("WhatsApp uses checkWhatsapp and keeps @c.us primary with @lid alias", async () => {
    const { client, checkAccount } = clientWithCheck({
      existsWhatsapp: true,
      chatId: "123456789012345@lid",
      phoneNumber: "79876543210@c.us",
    })

    await expect(messengers.whatsapp.checkAccount(client, { phoneNumber: 79876543210 })).resolves.toMatchObject({
      exists: true,
      chatId: "79876543210@c.us",
      aliases: ["123456789012345@lid"],
    })
    expect(checkAccount).toHaveBeenCalledWith("checkWhatsapp", { phoneNumber: 79876543210 })
  })
})

describe("normalizeMessages flags", () => {
  const base = { type: "incoming" as const, typeMessage: "textMessage", chatId: "1" }

  it("folds edit and delete records into the original message", () => {
    // Shape observed in the real Telegram journal: a separate record points to the original.
    const messages = normalizeMessages([
      { ...base, idMessage: "orig-1", timestamp: 10, textMessage: "Tфыв" },
      { ...base, idMessage: "edit-1", timestamp: 20, textMessage: "Тфыв", isEdited: true, editedMessageId: "orig-1" },
      { ...base, idMessage: "orig-2", timestamp: 30, textMessage: "Bb" },
      { ...base, idMessage: "del-1", timestamp: 40, textMessage: "Bb", isDeleted: true, deletedMessageId: "orig-2" },
    ])

    expect(messages).toEqual([
      expect.objectContaining({ id: "orig-1", text: "Тфыв", isEdited: true, sentAt: 10_000 }),
      expect.objectContaining({ id: "orig-2", text: "Bb", isDeleted: true, sentAt: 30_000 }),
    ])
  })

  it("keeps a flagged record when the original is not in the list", () => {
    const [message] = normalizeMessages([
      { ...base, idMessage: "del-1", timestamp: 40, textMessage: "Bb", isDeleted: true, deletedMessageId: "gone" },
    ])
    expect(message).toMatchObject({ id: "del-1", text: "Bb", isDeleted: true })
  })

  it("reads isForwarded from the record or from extendedTextMessage", () => {
    const [a, b] = normalizeMessages([
      { ...base, idMessage: "a", timestamp: 1, textMessage: "fwd", isForwarded: true },
      { ...base, idMessage: "b", timestamp: 2, typeMessage: "extendedTextMessage", extendedTextMessage: { text: "fwd", isForwarded: true } },
    ])
    expect(a.isForwarded).toBe(true)
    expect(b.isForwarded).toBe(true)
  })
})
