import { z } from "zod"

import { normalizeStatus } from "./messengers"
import type { ChatMessage, MessageStatus } from "./types"

export type NotificationEvent =
  | { kind: "message"; message: ChatMessage; chatName?: string; chatType?: string }
  | { kind: "status"; chatId: string; messageId: string; status: MessageStatus }
  | { kind: "edit"; chatId: string; messageId: string; text: string }
  | { kind: "delete"; chatId: string; messageId: string }
  | { kind: "state"; state: string }
  | { kind: "ignore" }

const MESSAGE_WEBHOOKS = {
  incomingMessageReceived: "incoming",
  outgoingMessageReceived: "outgoing",
  outgoingAPIMessageReceived: "outgoing",
} as const

const messageBodySchema = z.object({
  typeWebhook: z.enum(["incomingMessageReceived", "outgoingMessageReceived", "outgoingAPIMessageReceived"]),
  timestamp: z.number(),
  idMessage: z.string(),
  senderData: z.object({
    chatId: z.string(),
    chatName: z.string().optional(),
    /** user / group / supergroup / channel — Telegram and MAX; WhatsApp has no channels. */
    chatType: z.string().optional(),
    senderName: z.string().optional(),
  }),
  messageData: z.object({
    typeMessage: z.string(),
    textMessageData: z.object({ textMessage: z.string(), isForwarded: z.boolean().optional() }).optional(),
    extendedTextMessageData: z.object({ text: z.string(), isForwarded: z.boolean().optional() }).optional(),
    // stanzaId is the id of the message that was edited / deleted.
    editedMessageData: z.object({ textMessage: z.string().optional(), stanzaId: z.string() }).optional(),
    deletedMessageData: z.object({ stanzaId: z.string() }).optional(),
  }),
})

const statusBodySchema = z.object({
  typeWebhook: z.literal("outgoingMessageStatus"),
  chatId: z.string(),
  idMessage: z.string(),
  status: z.string(),
})

const stateBodySchema = z.object({
  typeWebhook: z.literal("stateInstanceChanged"),
  stateInstance: z.string(),
})

const IGNORE = { kind: "ignore" } as const

/** Turns a raw ReceiveNotification body into an event the chat UI cares about. */
export function parseNotification(body: unknown): NotificationEvent {
  const message = messageBodySchema.safeParse(body)
  if (message.success) {
    const { typeWebhook, timestamp, idMessage, senderData, messageData } = message.data
    const { editedMessageData, deletedMessageData } = messageData

    if (messageData.typeMessage === "editedMessage" && editedMessageData?.textMessage) {
      return {
        kind: "edit",
        chatId: senderData.chatId,
        messageId: editedMessageData.stanzaId,
        text: editedMessageData.textMessage,
      }
    }
    if (messageData.typeMessage === "deletedMessage" && deletedMessageData) {
      return { kind: "delete", chatId: senderData.chatId, messageId: deletedMessageData.stanzaId }
    }

    const textData =
      messageData.typeMessage === "textMessage"
        ? { text: messageData.textMessageData?.textMessage, isForwarded: messageData.textMessageData?.isForwarded }
        : messageData.typeMessage === "extendedTextMessage" || messageData.typeMessage === "quotedMessage"
          ? messageData.extendedTextMessageData
          : undefined
    const text = textData?.text
    if (!text) return IGNORE

    const direction = MESSAGE_WEBHOOKS[typeWebhook]
    return {
      kind: "message",
      chatType: senderData.chatType,
      chatName: senderData.chatName || (direction === "incoming" ? senderData.senderName : undefined),
      message: {
        id: idMessage,
        chatId: senderData.chatId,
        direction,
        text,
        sentAt: timestamp * 1000,
        status: direction === "outgoing" ? "sent" : undefined,
        senderName: direction === "incoming" ? senderData.senderName : undefined,
        isForwarded: textData.isForwarded || undefined,
      },
    }
  }

  const status = statusBodySchema.safeParse(body)
  if (status.success) {
    const normalized = normalizeStatus(status.data.status)
    if (!normalized) return IGNORE
    return {
      kind: "status",
      chatId: status.data.chatId,
      messageId: status.data.idMessage,
      status: normalized,
    }
  }

  const state = stateBodySchema.safeParse(body)
  if (state.success) return { kind: "state", state: state.data.stateInstance }

  return IGNORE
}
