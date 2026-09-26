import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent, useState } from "react"

import { GreenApiError, isAbortError } from "@/lib/green-api/errors"
import { isGroupChatId, isHiddenChatType } from "@/lib/green-api/messengers"
import { parseNotification, type NotificationEvent } from "@/lib/green-api/notifications"
import type { Chat } from "@/lib/green-api/types"
import { useMessageCache, useReadChat } from "@/features/chat/queries"
import { queryKeys } from "@/features/session/query-keys"
import { useAuthedSession } from "@/features/session/session-context"

import { useChatUi } from "./chat-ui-context"
import { findChat, resolveChatId } from "./queries"

/** Long polling timeout, seconds (API allows 5–60). */
const RECEIVE_TIMEOUT = 20
const MAX_BACKOFF_MS = 30_000
const WEBHOOK_RETRY_MS = 30_000
/** An empty long poll answered faster than this means the server didn't wait. */
const MIN_EMPTY_POLL_MS = 1000
const MAX_EMPTY_BACKOFF_MS = 10_000
/**
 * The queue keeps notifications for 24h, so right after login it may replay old ones.
 * Their unread state is already seeded from the server, so they don't bump counters.
 * The margin tolerates clock skew between the browser and the messenger.
 */
const STALE_NOTIFICATION_MS = 2 * 60_000

export type PollerStatus = "online" | "offline" | "webhookSet"

/** What the polling tab relays to the other tabs of the same instance. */
type TabMessage = { type: "event"; event: NotificationEvent } | { type: "status"; status: PollerStatus }

export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      // Don't let listeners pile up on the long-lived signal during backoff.
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal.addEventListener("abort", onAbort, { once: true })
  })
}

/**
 * ReceiveNotification → handle → DeleteNotification loop.
 *
 * All tabs share one notification queue, and every read deletes from it. So only one
 * tab polls (Web Locks) and relays events to the others (BroadcastChannel); if it is
 * closed, another tab takes the lock over. The AbortController guarantees StrictMode's
 * double effect never leaves two loops running.
 */
export function useNotificationPoller(chats: Chat[]) {
  const { client, credentials } = useAuthedSession()
  const queryClient = useQueryClient()
  const cache = useMessageCache()
  const { state, dispatch } = useChatUi()
  const readChat = useReadChat()
  // Optimistically online: the first long poll may legitimately hang for receiveTimeout,
  // and failures switch the status to offline anyway.
  const [status, setStatus] = useState<PollerStatus>("online")
  const [mountedAt] = useState(Date.now)

  const handleEvent = useEffectEvent((event: NotificationEvent) => {
    switch (event.kind) {
      case "message": {
        const { message } = event
        // Channels are hidden from the list, so their messages are skipped too.
        if (isHiddenChatType(event.chatType)) break
        const known = findChat(chats, message.chatId)
        const chatId = known?.chatId ?? message.chatId
        if (!known) {
          dispatch({
            type: "addLocalChat",
            chat: {
              chatId,
              name: event.chatName || chatId,
              type: isGroupChatId(chatId) ? "group" : "user",
              aliases: [],
            },
          })
          void queryClient.invalidateQueries({ queryKey: queryKeys.chats(credentials.idInstance) })
        }
        cache.addMessage(chatId, message)
        if (message.direction === "incoming") {
          if (chatId === state.activeChatId) readChat(message.chatId, message.id)
          else if (message.sentAt >= mountedAt - STALE_NOTIFICATION_MS) {
            dispatch({ type: "incrementUnread", chatId })
          }
        }
        break
      }
      case "status":
        cache.setStatus(resolveChatId(chats, event.chatId), event.messageId, event.status)
        break
      case "edit":
        cache.editMessage(resolveChatId(chats, event.chatId), event.messageId, event.text)
        break
      case "delete":
        cache.markDeleted(resolveChatId(chats, event.chatId), event.messageId)
        break
      case "state":
        queryClient.setQueryData(queryKeys.state(credentials.idInstance), { stateInstance: event.state })
        break
    }
  })

  const handleTabMessage = useEffectEvent((message: TabMessage) => {
    if (message.type === "event") handleEvent(message.event)
    else setStatus(message.status)
  })

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(`green-api-chat:notifications:${credentials.idInstance}`)
    channel?.addEventListener("message", (event: MessageEvent<TabMessage>) => handleTabMessage(event.data))

    const publishStatus = (next: PollerStatus) => {
      setStatus(next)
      channel?.postMessage({ type: "status", status: next } satisfies TabMessage)
    }

    async function poll() {
      let failures = 0
      let fastEmptyPolls = 0
      while (!signal.aborted) {
        const startedAt = Date.now()
        try {
          const notification = await client
            .receiveNotification(RECEIVE_TIMEOUT, signal)
            .catch((error: unknown) => {
              // WhatsApp answers a long poll that timed out with 408 instead of an empty 200.
              if (error instanceof GreenApiError && error.status === 408) return null
              throw error
            })
          failures = 0
          publishStatus("online")

          if (!notification) {
            // Normally an empty answer comes after receiveTimeout. If the server answers
            // right away, back off instead of hammering it in a tight loop.
            if (Date.now() - startedAt < MIN_EMPTY_POLL_MS) {
              fastEmptyPolls += 1
              await sleep(Math.min(MIN_EMPTY_POLL_MS * fastEmptyPolls, MAX_EMPTY_BACKOFF_MS), signal)
            } else {
              fastEmptyPolls = 0
            }
            continue
          }
          fastEmptyPolls = 0

          try {
            const event = parseNotification(notification.body)
            if (event.kind !== "ignore") {
              handleEvent(event)
              channel?.postMessage({ type: "event", event } satisfies TabMessage)
            }
          } finally {
            // Must be acknowledged whatever it was, otherwise the queue gets stuck on it.
            await client.deleteNotification(notification.receiptId, signal).catch((error: unknown) => {
              if (!isAbortError(error)) console.warn("deleteNotification failed", error)
            })
          }
        } catch (error) {
          if (signal.aborted || isAbortError(error)) return
          if (error instanceof GreenApiError && error.isWebhookUrlSet) {
            publishStatus("webhookSet")
            await sleep(WEBHOOK_RETRY_MS, signal)
            continue
          }
          failures += 1
          publishStatus("offline")
          await sleep(Math.min(1000 * 2 ** (failures - 1), MAX_BACKOFF_MS), signal)
        }
      }
    }

    // Tabs without Web Locks (old browsers, jsdom) just poll on their own.
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks
    const run = locks
      ? locks.request(`green-api-chat:poller:${credentials.idInstance}`, { signal }, poll)
      : poll()
    run.catch((error: unknown) => {
      if (!signal.aborted && !isAbortError(error)) console.error("Notification poller stopped", error)
    })

    return () => {
      controller.abort()
      channel?.close()
    }
  }, [client, credentials.idInstance])

  return status
}
