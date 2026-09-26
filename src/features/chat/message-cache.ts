import type { QueryClient } from "@tanstack/react-query"

import type { ChatMessage, MessageStatus } from "@/lib/green-api/types"
import { queryKeys } from "@/features/session/query-keys"

export type LastMessages = Record<string, ChatMessage>

/** Journals digest: newest message and unread count per chat. */
export interface Journal {
  lastByChat: LastMessages
  /** Unread incoming messages at load time (only where the messenger reports isRead). */
  unreadByChat: Record<string, number>
}

const STATUS_RANK: Record<MessageStatus, number> = {
  failed: 0,
  pending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
}

/** Statuses may arrive out of order; never downgrade read → delivered. */
function mergeStatus(current: MessageStatus | undefined, next: MessageStatus) {
  if (!current || next === "failed") return next
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current
}

function upsertInList(messages: ChatMessage[], message: ChatMessage) {
  const index = messages.findIndex((item) => item.id === message.id)
  if (index === -1) {
    return [...messages, message].sort((a, b) => a.sentAt - b.sentAt)
  }
  const next = [...messages]
  next[index] = { ...next[index], ...message, status: next[index].status ?? message.status }
  return next
}

/**
 * Helpers that keep history and chat list previews in sync without refetching.
 * History is only touched when it is already cached — otherwise it will be fetched fresh.
 */
export function createMessageCache(queryClient: QueryClient, idInstance: string) {
  const historyKey = (chatId: string) => queryKeys.history(idInstance, chatId)
  const journalKey = queryKeys.journal(idInstance)

  function setLastMessage(chatId: string, update: (current?: ChatMessage) => ChatMessage | undefined) {
    queryClient.setQueryData<Journal>(journalKey, (journal) => {
      if (!journal) return journal
      const current = journal.lastByChat[chatId]
      const next = update(current)
      if (!next || next === current) return journal
      return { ...journal, lastByChat: { ...journal.lastByChat, [chatId]: next } }
    })
  }

  /** Patches one message in history and in the chat list preview. */
  function updateMessage(chatId: string, messageId: string, patch: (message: ChatMessage) => ChatMessage) {
    const apply = (message: ChatMessage) => (message.id === messageId ? patch(message) : message)
    queryClient.setQueryData<ChatMessage[]>(historyKey(chatId), (messages) => messages?.map(apply))
    setLastMessage(chatId, (current) => (current ? apply(current) : current))
  }

  return {
    addMessage(chatId: string, message: ChatMessage) {
      const normalized = { ...message, chatId }
      queryClient.setQueryData<ChatMessage[]>(historyKey(chatId), (messages) =>
        messages ? upsertInList(messages, normalized) : messages,
      )
      setLastMessage(chatId, (current) =>
        !current || current.sentAt <= normalized.sentAt ? normalized : current,
      )
    },

    setStatus(chatId: string, messageId: string, status: MessageStatus) {
      updateMessage(chatId, messageId, (message) => ({ ...message, status: mergeStatus(message.status, status) }))
    },

    editMessage(chatId: string, messageId: string, text: string) {
      updateMessage(chatId, messageId, (message) => ({ ...message, text, isEdited: true }))
    },

    markDeleted(chatId: string, messageId: string) {
      updateMessage(chatId, messageId, (message) => ({ ...message, isDeleted: true }))
    },

    /** Swaps the optimistic temp id for the real idMessage once sendMessage responds. */
    confirmMessage(chatId: string, tempId: string, idMessage: string) {
      const confirm = (message: ChatMessage): ChatMessage =>
        message.id === tempId
          ? { ...message, id: idMessage, status: mergeStatus(message.status, "sent") }
          : message
      queryClient.setQueryData<ChatMessage[]>(historyKey(chatId), (messages) => {
        if (!messages) return messages
        // The outgoingAPIMessageReceived notification may have beaten the HTTP response.
        const echo = messages.find((message) => message.id === idMessage)
        return messages
          .filter((message) => message !== echo)
          .map(confirm)
          .map((message) =>
            message.id === idMessage && echo?.status
              ? { ...message, status: mergeStatus(message.status, echo.status) }
              : message,
          )
      })
      setLastMessage(chatId, (current) => (current ? confirm(current) : current))
    },

    removeMessage(chatId: string, messageId: string) {
      queryClient.setQueryData<ChatMessage[]>(historyKey(chatId), (messages) =>
        messages?.filter((message) => message.id !== messageId),
      )
    },
  }
}

export type MessageCache = ReturnType<typeof createMessageCache>
