import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it } from "vitest"

import type { ChatMessage } from "@/lib/green-api/types"
import { queryKeys } from "@/features/session/query-keys"

import { createMessageCache, type Journal } from "./message-cache"

const ID = "4100123456"
const CHAT = "10000000"

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: "1", chatId: CHAT, direction: "incoming", text: "hi", sentAt: 1000, ...overrides }
}

describe("createMessageCache", () => {
  let queryClient: QueryClient
  let cache: ReturnType<typeof createMessageCache>
  const history = () => queryClient.getQueryData<ChatMessage[]>(queryKeys.history(ID, CHAT))
  const last = () => queryClient.getQueryData<Journal>(queryKeys.journal(ID))?.lastByChat[CHAT]

  beforeEach(() => {
    queryClient = new QueryClient()
    cache = createMessageCache(queryClient, ID)
    queryClient.setQueryData(queryKeys.history(ID, CHAT), [message({ id: "1", sentAt: 1000 })])
    queryClient.setQueryData<Journal>(queryKeys.journal(ID), { lastByChat: {}, unreadByChat: {} })
  })

  it("adds messages in order and deduplicates by id", () => {
    cache.addMessage(CHAT, message({ id: "3", sentAt: 3000 }))
    cache.addMessage(CHAT, message({ id: "2", sentAt: 2000 }))
    cache.addMessage(CHAT, message({ id: "3", sentAt: 3000 }))

    expect(history()?.map((item) => item.id)).toEqual(["1", "2", "3"])
    expect(last()?.id).toBe("3")
  })

  it("does not create history that was never loaded", () => {
    cache.addMessage("other", message({ id: "9", chatId: "other" }))
    expect(queryClient.getQueryData(queryKeys.history(ID, "other"))).toBeUndefined()
    expect(queryClient.getQueryData<Journal>(queryKeys.journal(ID))?.lastByChat.other?.id).toBe("9")
  })

  it("confirms an optimistic message with the real id", () => {
    cache.addMessage(CHAT, message({ id: "pending-1", direction: "outgoing", status: "pending", sentAt: 2000 }))
    cache.confirmMessage(CHAT, "pending-1", "real-1")

    expect(history()?.at(-1)).toMatchObject({ id: "real-1", status: "sent" })
    expect(last()).toMatchObject({ id: "real-1", status: "sent" })
  })

  it("merges the API echo that arrived before the sendMessage response", () => {
    cache.addMessage(CHAT, message({ id: "pending-1", direction: "outgoing", status: "pending", sentAt: 2000 }))
    cache.addMessage(CHAT, message({ id: "real-1", direction: "outgoing", status: "sent", sentAt: 2001 }))
    cache.setStatus(CHAT, "real-1", "delivered")
    cache.confirmMessage(CHAT, "pending-1", "real-1")

    const outgoing = history()?.filter((item) => item.direction === "outgoing")
    expect(outgoing).toHaveLength(1)
    expect(outgoing?.[0]).toMatchObject({ id: "real-1", status: "delivered" })
  })

  it("never downgrades a status", () => {
    cache.addMessage(CHAT, message({ id: "5", direction: "outgoing", status: "sent", sentAt: 5000 }))
    cache.setStatus(CHAT, "5", "read")
    cache.setStatus(CHAT, "5", "delivered")
    expect(history()?.at(-1)?.status).toBe("read")
  })

  it("removes messages", () => {
    cache.removeMessage(CHAT, "1")
    expect(history()).toEqual([])
  })
})
