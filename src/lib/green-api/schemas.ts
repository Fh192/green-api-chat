import { z } from "zod"

// Raw response shapes. Fields differ slightly between messengers, so everything
// that is not shared by all of them is optional and normalized in messengers.ts.

/** Array that drops items not matching the schema instead of failing entirely. */
function lenientArray<T extends z.ZodType>(item: T) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((value) => {
      const parsed = item.safeParse(value)
      return parsed.success ? [parsed.data as z.output<T>] : []
    }),
  )
}

export const stateInstanceSchema = z.object({
  stateInstance: z.string(),
})

export const settingsSchema = z.object({
  typeInstance: z.string().optional(),
  webhookUrl: z.string().nullish(),
  incomingWebhook: z.string().optional(),
  outgoingWebhook: z.string().optional(),
  outgoingMessageWebhook: z.string().optional(),
  outgoingAPIMessageWebhook: z.string().optional(),
  stateWebhook: z.string().optional(),
  editedMessageWebhook: z.string().optional(),
  deletedMessageWebhook: z.string().optional(),
})
export type InstanceSettings = z.infer<typeof settingsSchema>

export const setSettingsResponseSchema = z.object({
  saveSettings: z.boolean(),
})

export const checkAccountResponseSchema = z.object({
  exist: z.boolean().optional(),
  existsWhatsapp: z.boolean().optional(),
  chatId: z.string().optional(),
  phoneNumber: z.union([z.number(), z.string()]).optional(),
  username: z.string().optional(),
  status: z.boolean().optional(),
  reason: z.string().optional(),
})
export type CheckAccountResponse = z.infer<typeof checkAccountResponseSchema>

export const rawChatSchema = z.object({
  chatId: z.string().optional(),
  id: z.string().optional(),
  newChatId: z.string().optional(),
  name: z.string().nullish(),
  type: z.string().optional(),
  phoneNumber: z.union([z.number(), z.string()]).optional(),
  username: z.string().nullish(),
  /** WhatsApp only. */
  unreadCount: z.number().optional(),
})
export type RawChat = z.infer<typeof rawChatSchema>
export const getChatsResponseSchema = lenientArray(rawChatSchema)

export const rawMessageSchema = z.object({
  type: z.enum(["incoming", "outgoing"]),
  idMessage: z.string(),
  timestamp: z.number(),
  typeMessage: z.string(),
  chatId: z.string(),
  textMessage: z.string().optional(),
  extendedTextMessage: z
    .object({ text: z.string().optional(), isForwarded: z.boolean().optional() })
    .optional(),
  statusMessage: z.string().optional(),
  senderName: z.string().optional(),
  /** Incoming journal of WhatsApp; not documented for Telegram and MAX. */
  isRead: z.boolean().optional(),
  isForwarded: z.boolean().optional(),
  isEdited: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  /** Set on journal records that describe an edit/deletion of another message. */
  editedMessageId: z.string().optional(),
  deletedMessageId: z.string().optional(),
})
export type RawMessage = z.infer<typeof rawMessageSchema>
export const messageListSchema = lenientArray(rawMessageSchema)

export const contactInfoSchema = z.object({
  avatar: z.string().nullish(),
  name: z.string().nullish(),
  contactName: z.string().nullish(),
  chatId: z.string().optional(),
  lastSeen: z.number().nullish(),
  phoneNumber: z.union([z.number(), z.string()]).nullish(),
  username: z.string().nullish(),
})
export type ContactInfo = z.infer<typeof contactInfoSchema>

export const readChatResponseSchema = z.object({
  setRead: z.boolean(),
})

export const sendMessageResponseSchema = z.object({
  idMessage: z.string(),
})

export const notificationSchema = z.object({
  receiptId: z.number(),
  body: z.record(z.string(), z.unknown()),
})
export type Notification = z.infer<typeof notificationSchema>

export const deleteNotificationResponseSchema = z.object({
  result: z.boolean(),
})
