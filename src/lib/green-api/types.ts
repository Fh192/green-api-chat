export type MessengerId = "telegram" | "whatsapp" | "max"

export interface Credentials {
  messenger: MessengerId
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export type ChatType = "user" | "group"

export interface Chat {
  chatId: string
  name: string
  type: ChatType
  phoneNumber?: number
  username?: string
  /** Unread counter reported by the messenger (WhatsApp getChats). */
  unreadCount?: number
  /** Other ids the messenger may use for the same chat (e.g. WhatsApp @lid vs @c.us). */
  aliases: string[]
}

export type MessageDirection = "incoming" | "outgoing"

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed"

export interface ChatMessage {
  id: string
  chatId: string
  direction: MessageDirection
  text: string
  /** Unix time in milliseconds. */
  sentAt: number
  status?: MessageStatus
  senderName?: string
  isForwarded?: boolean
  isEdited?: boolean
  /** Deleted messages are kept and shown as deleted, like edited ones. */
  isDeleted?: boolean
}

export type InstanceState =
  | "authorized"
  | "notAuthorized"
  | "blocked"
  | "suspended"
  | "starting"
  | "pendingPassword"
  | "yellowCard"
  | "sleepMode"
