import type { GreenApiClient } from "./client"
import { GreenApiError } from "./errors"
import type { CheckAccountResponse, RawChat, RawMessage } from "./schemas"
import type { Chat, ChatMessage, MessageStatus, MessengerId } from "./types"

export type CheckTarget = { phoneNumber: number } | { username: string }

export interface CheckResult {
  exists: boolean
  chatId: string
  aliases: string[]
  phoneNumber?: number
  username?: string
}

export interface MessengerAdapter {
  id: MessengerId
  label: string
  /** Value of `typeInstance` in getSettings / notifications. */
  typeInstance: string
  maxMessageLength: number
  phone: {
    minDigits: number
    maxDigits: number
    /** Allowed country codes; empty means any. */
    countryCodes: string[]
  }
  supportsUsername: boolean
  checkAccount(client: GreenApiClient, target: CheckTarget): Promise<CheckResult>
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined
  const digits = Number(String(value).replace(/\D/g, ""))
  return Number.isFinite(digits) && digits > 0 ? digits : undefined
}

function unwrapCheck(response: CheckAccountResponse) {
  // Not authorized instance answers 200 with { status: false, reason }.
  if (response.status === false) {
    throw new GreenApiError(200, response.reason ?? "Инстанс не авторизован")
  }
  return response
}

const telegram: MessengerAdapter = {
  id: "telegram",
  label: "Telegram",
  typeInstance: "telegram",
  maxMessageLength: 4096,
  phone: { minDigits: 10, maxDigits: 15, countryCodes: [] },
  supportsUsername: true,
  async checkAccount(client, target) {
    const response = unwrapCheck(await client.checkAccount("checkAccount", target))
    return {
      exists: Boolean(response.exist && response.chatId),
      chatId: response.chatId ?? "",
      aliases: [],
      phoneNumber: toNumber(response.phoneNumber),
      username: response.username || undefined,
    }
  },
}

const max: MessengerAdapter = {
  id: "max",
  label: "MAX",
  typeInstance: "v3",
  maxMessageLength: 4000,
  phone: { minDigits: 11, maxDigits: 12, countryCodes: ["7", "375"] },
  supportsUsername: false,
  async checkAccount(client, target) {
    const response = unwrapCheck(await client.checkAccount("checkAccount", target))
    return {
      exists: Boolean(response.exist && response.chatId),
      chatId: response.chatId ?? "",
      aliases: [],
      phoneNumber: "phoneNumber" in target ? target.phoneNumber : undefined,
    }
  },
}

const whatsapp: MessengerAdapter = {
  id: "whatsapp",
  label: "WhatsApp",
  typeInstance: "whatsapp",
  maxMessageLength: 20000,
  phone: { minDigits: 11, maxDigits: 16, countryCodes: [] },
  supportsUsername: false,
  async checkAccount(client, target) {
    if (!("phoneNumber" in target)) {
      throw new GreenApiError(400, "WhatsApp ищет только по номеру телефона")
    }
    const phoneChatId = `${target.phoneNumber}@c.us`
    const response = unwrapCheck(await client.checkAccount("checkWhatsapp", target))
    // Replies may come either with the @lid returned here or with the @c.us id,
    // so the chat keeps the phone-based id as primary and the lid as an alias.
    const aliases = [response.chatId, response.phoneNumber]
      .filter((id): id is string => typeof id === "string" && id !== "" && id !== phoneChatId)
    return {
      exists: Boolean(response.existsWhatsapp),
      chatId: phoneChatId,
      aliases,
      phoneNumber: target.phoneNumber,
    }
  },
}

export const messengers: Record<MessengerId, MessengerAdapter> = { telegram, whatsapp, max }

export const messengerList = [telegram, whatsapp, max]

export function messengerByTypeInstance(typeInstance: string | undefined) {
  return messengerList.find((messenger) => messenger.typeInstance === typeInstance)
}

const GROUP_TYPES = new Set(["group", "supergroup"])
const HIDDEN_TYPES = new Set(["channel"])

/** Group ids: negative in Telegram/MAX, @g.us in WhatsApp. */
export function isGroupChatId(chatId: string) {
  return chatId.startsWith("-") || chatId.endsWith("@g.us")
}

/** Chats we can't write to (channels) are not shown at all. */
export function isHiddenChatType(type: string | undefined) {
  return type !== undefined && HIDDEN_TYPES.has(type)
}

/** Normalizes getChats items of any messenger. Returns null for chats we can't write to. */
export function normalizeChat(raw: RawChat): Chat | null {
  const chatId = raw.chatId ?? raw.id
  if (!chatId || isHiddenChatType(raw.type)) return null

  const isGroup = (raw.type !== undefined && GROUP_TYPES.has(raw.type)) || isGroupChatId(chatId)
  const phoneNumber = toNumber(raw.phoneNumber)
  const username = raw.username || undefined

  return {
    chatId,
    name: raw.name || username || (phoneNumber ? `+${phoneNumber}` : chatId),
    type: isGroup ? "group" : "user",
    phoneNumber,
    username,
    unreadCount: raw.unreadCount,
    aliases: raw.newChatId && raw.newChatId !== chatId ? [raw.newChatId] : [],
  }
}

// quotedMessage is a reply to another message; its own text is shown as a plain message.
const TEXT_MESSAGE_TYPES = new Set(["textMessage", "extendedTextMessage", "quotedMessage"])

export function normalizeStatus(statusMessage: string | undefined): MessageStatus | undefined {
  switch (statusMessage) {
    case "pending":
    case "sent":
    case "delivered":
    case "read":
      return statusMessage
    case "failed":
    case "noAccount":
      return "failed"
    default:
      return undefined
  }
}

/** Normalizes journal / history items. Non-text messages are skipped (null). */
export function normalizeMessage(raw: RawMessage): ChatMessage | null {
  if (!TEXT_MESSAGE_TYPES.has(raw.typeMessage)) return null
  const text = raw.textMessage ?? raw.extendedTextMessage?.text
  if (!text) return null

  return {
    id: raw.idMessage,
    chatId: raw.chatId,
    direction: raw.type,
    text,
    sentAt: raw.timestamp * 1000,
    status: raw.type === "outgoing" ? (normalizeStatus(raw.statusMessage) ?? "sent") : undefined,
    senderName: raw.senderName || undefined,
    isForwarded: (raw.isForwarded ?? raw.extendedTextMessage?.isForwarded) || undefined,
    isEdited: raw.isEdited || undefined,
    isDeleted: raw.isDeleted || undefined,
  }
}

/** Id of another message this journal record edits or deletes, if any. */
function targetOf(raw: RawMessage) {
  const target = (raw.isDeleted && raw.deletedMessageId) || (raw.isEdited && raw.editedMessageId)
  return target && target !== raw.idMessage ? target : undefined
}

/**
 * Returns chats' messages sorted oldest → newest (API returns newest first).
 * Journals may store an edit/deletion as a separate record pointing to the original
 * (editedMessageId / deletedMessageId): it is folded into the original when present,
 * otherwise the record itself is shown with the flag.
 */
export function normalizeMessages(raw: RawMessage[]) {
  const messages = new Map<string, ChatMessage>()
  const changes: { target: string; record: RawMessage }[] = []

  for (const record of [...raw].sort((a, b) => a.timestamp - b.timestamp)) {
    const target = targetOf(record)
    if (target) changes.push({ target, record })
    const message = normalizeMessage(record)
    if (message) messages.set(message.id, message)
  }

  for (const { target, record } of changes) {
    const original = messages.get(target)
    if (!original) continue
    messages.delete(record.idMessage)
    messages.set(target, {
      ...original,
      text: record.isEdited && record.textMessage ? record.textMessage : original.text,
      isEdited: original.isEdited || record.isEdited || undefined,
      isDeleted: original.isDeleted || record.isDeleted || undefined,
    })
  }

  return [...messages.values()].sort((a, b) => a.sentAt - b.sentAt)
}
