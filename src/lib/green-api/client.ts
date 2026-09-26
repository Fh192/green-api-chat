import type { z } from "zod"

import { GreenApiError } from "./errors"
import {
  checkAccountResponseSchema,
  contactInfoSchema,
  deleteNotificationResponseSchema,
  getChatsResponseSchema,
  messageListSchema,
  notificationSchema,
  readChatResponseSchema,
  sendMessageResponseSchema,
  setSettingsResponseSchema,
  settingsSchema,
  stateInstanceSchema,
  type InstanceSettings,
} from "./schemas"
import type { Credentials } from "./types"

interface RequestOptions<T extends z.ZodType> {
  httpMethod?: "GET" | "POST" | "DELETE"
  /** Extra path segment after the token, e.g. receiptId for deleteNotification. */
  pathSuffix?: string
  query?: Record<string, string | number>
  body?: unknown
  schema: T
  signal?: AbortSignal
}

export function buildMethodUrl(
  credentials: Pick<Credentials, "apiUrl" | "idInstance" | "apiTokenInstance">,
  method: string,
  pathSuffix?: string,
) {
  const base = credentials.apiUrl.trim().replace(/\/+$/, "")
  const suffix = pathSuffix ? `/${encodeURIComponent(pathSuffix)}` : ""
  return `${base}/waInstance${credentials.idInstance}/${method}/${credentials.apiTokenInstance}${suffix}`
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "")
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    const message = data.message ?? data.error ?? data.reason
    if (typeof message === "string" && message) return message
  } catch {
    // not JSON — fall through to raw text
  }
  return text || response.statusText
}

export function createGreenApiClient(credentials: Credentials) {
  async function request<T extends z.ZodType>(
    method: string,
    { httpMethod = "GET", pathSuffix, query, body, schema, signal }: RequestOptions<T>,
  ): Promise<z.output<T>> {
    const url = new URL(buildMethodUrl(credentials, method, pathSuffix))
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, String(value))
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: httpMethod,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new GreenApiError(0, error instanceof Error ? error.message : "Network error")
    }

    if (!response.ok) {
      throw new GreenApiError(response.status, await readErrorMessage(response))
    }

    const text = await response.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      throw new GreenApiError(response.status, `Неожиданный ответ метода ${method}`)
    }
    const parsed = schema.safeParse(data)
    if (!parsed.success) {
      throw new GreenApiError(response.status, `Неожиданный ответ метода ${method}`)
    }
    return parsed.data
  }

  return {
    getStateInstance: (signal?: AbortSignal) =>
      request("getStateInstance", { schema: stateInstanceSchema, signal }),

    getSettings: (signal?: AbortSignal) =>
      request("getSettings", { schema: settingsSchema, signal }),

    setSettings: (settings: Partial<InstanceSettings>) =>
      request("setSettings", {
        httpMethod: "POST",
        body: settings,
        schema: setSettingsResponseSchema,
      }),

    /** CheckAccount (Telegram, MAX) or CheckWhatsapp — the adapter picks the method. */
    checkAccount: (
      method: "checkAccount" | "checkWhatsapp",
      body: { phoneNumber: number } | { username: string },
    ) =>
      request(method, { httpMethod: "POST", body, schema: checkAccountResponseSchema }),

    getChats: (signal?: AbortSignal) =>
      request("getChats", { schema: getChatsResponseSchema, signal }),

    getChatHistory: (chatId: string, count: number, signal?: AbortSignal) =>
      request("getChatHistory", {
        httpMethod: "POST",
        body: { chatId, count },
        schema: messageListSchema,
        signal,
      }),

    lastIncomingMessages: (minutes: number, signal?: AbortSignal) =>
      request("lastIncomingMessages", { query: { minutes }, schema: messageListSchema, signal }),

    lastOutgoingMessages: (minutes: number, signal?: AbortSignal) =>
      request("lastOutgoingMessages", { query: { minutes }, schema: messageListSchema, signal }),

    getContactInfo: (chatId: string, signal?: AbortSignal) =>
      request("getContactInfo", {
        httpMethod: "POST",
        body: { chatId },
        schema: contactInfoSchema,
        signal,
      }),

    sendMessage: (chatId: string, message: string) =>
      request("sendMessage", {
        httpMethod: "POST",
        body: { chatId, message },
        schema: sendMessageResponseSchema,
      }),

    readChat: (chatId: string, idMessage?: string) =>
      request("readChat", {
        httpMethod: "POST",
        body: idMessage ? { chatId, idMessage } : { chatId },
        schema: readChatResponseSchema,
      }),

    /** Long polling: resolves with null when nothing arrived within `receiveTimeout` seconds. */
    receiveNotification: (receiveTimeout: number, signal?: AbortSignal) =>
      request("receiveNotification", {
        query: { receiveTimeout },
        schema: notificationSchema.nullable(),
        signal,
      }),

    deleteNotification: (receiptId: number, signal?: AbortSignal) =>
      request("deleteNotification", {
        httpMethod: "DELETE",
        pathSuffix: String(receiptId),
        schema: deleteNotificationResponseSchema,
        signal,
      }),
  }
}

export type GreenApiClient = ReturnType<typeof createGreenApiClient>
