import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"

import { normalizeChat, normalizeMessages } from "@/lib/green-api/messengers"
import type { Chat } from "@/lib/green-api/types"
import type { Journal, LastMessages } from "@/features/chat/message-cache"
import { queryKeys } from "@/features/session/query-keys"
import { useAuthedSession } from "@/features/session/session-context"

import { useChatUi } from "./chat-ui-context"

/** Journals window used for chat list previews (GREEN-API default is 24h). */
const JOURNAL_MINUTES = 1440

// Query functions deliberately ignore the abort signal: most of these methods allow
// 1 request/second, and an aborted request (StrictMode remount, fast chat switching)
// still counts on the server, so the immediate re-request would get 429.

export function useChatsQuery() {
  const { client, credentials } = useAuthedSession()
  return useQuery({
    queryKey: queryKeys.chats(credentials.idInstance),
    queryFn: async () =>
      (await client.getChats())
        .map(normalizeChat)
        .filter((chat): chat is Chat => chat !== null),
  })
}

export function useJournalQuery() {
  const { client, credentials } = useAuthedSession()
  return useQuery({
    queryKey: queryKeys.journal(credentials.idInstance),
    queryFn: async (): Promise<Journal> => {
      const [incoming, outgoing] = await Promise.all([
        client.lastIncomingMessages(JOURNAL_MINUTES),
        client.lastOutgoingMessages(JOURNAL_MINUTES),
      ])
      const lastByChat: LastMessages = {}
      for (const message of normalizeMessages([...incoming, ...outgoing])) {
        lastByChat[message.chatId] = message // sorted ascending, so the newest wins
      }
      const unreadByChat: Record<string, number> = {}
      for (const message of incoming) {
        if (message.isRead === false) unreadByChat[message.chatId] = (unreadByChat[message.chatId] ?? 0) + 1
      }
      return { lastByChat, unreadByChat }
    },
  })
}

export interface ChatListItem extends Chat {
  lastMessage?: LastMessages[string]
  unread: number
}

/** Server chats + session-local chats, sorted by last activity like in Telegram. */
export function useChatList() {
  const chatsQuery = useChatsQuery()
  const journalQuery = useJournalQuery()
  const { state, dispatch } = useChatUi()

  const chats = useMemo(() => {
    const serverChats = chatsQuery.data ?? []
    const known = new Set(serverChats.flatMap((chat) => [chat.chatId, ...chat.aliases]))
    const localChats = state.localChats.filter((chat) => !known.has(chat.chatId))
    const last = journalQuery.data?.lastByChat ?? {}

    return [...localChats, ...serverChats]
      .map((chat, order) => {
        const lastMessage = [chat.chatId, ...chat.aliases]
          .map((id) => last[id])
          .filter(Boolean)
          .sort((a, b) => b.sentAt - a.sentAt)[0]
        const item: ChatListItem = { ...chat, lastMessage, unread: state.unread[chat.chatId] ?? 0 }
        // Freshly created chats without messages stay on top until the first message.
        const activity = lastMessage?.sentAt ?? (order < localChats.length ? Infinity : 0)
        return { item, order, activity }
      })
      .sort((a, b) => b.activity - a.activity || a.order - b.order)
      .map(({ item }) => item)
  }, [chatsQuery.data, journalQuery.data, state.localChats, state.unread])

  // Unread counters survive a reload thanks to the messenger's own read state:
  // getChats.unreadCount (WhatsApp) or isRead in the incoming journal. Seeded once,
  // later changes come from notifications.
  const serverChats = chatsQuery.data
  const journal = journalQuery.data
  const journalSettled = !journalQuery.isPending
  useEffect(() => {
    if (state.unreadSeeded || !serverChats || !journalSettled) return
    const counts: Record<string, number> = {}
    for (const chat of serverChats) {
      const fromJournal = [chat.chatId, ...chat.aliases].reduce(
        (sum, id) => sum + (journal?.unreadByChat[id] ?? 0),
        0,
      )
      const count = chat.unreadCount ?? fromJournal
      if (count > 0) counts[chat.chatId] = count
    }
    dispatch({ type: "seedUnread", counts })
  }, [state.unreadSeeded, serverChats, journal, journalSettled, dispatch])

  return {
    chats,
    isLoading: chatsQuery.isPending,
    error: chatsQuery.error,
    refetch: chatsQuery.refetch,
  }
}

/** Maps any id of a chat (including aliases) to the chat it belongs to. */
export function findChat(chats: Chat[], chatId: string) {
  return chats.find((chat) => chat.chatId === chatId || chat.aliases.includes(chatId))
}

/** Primary id of the chat an id (possibly an alias) belongs to; the id itself if unknown. */
export function resolveChatId(chats: Chat[], chatId: string) {
  return findChat(chats, chatId)?.chatId ?? chatId
}
