import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { toast } from "sonner"

import { describeError } from "@/lib/green-api/errors"
import { normalizeMessages } from "@/lib/green-api/messengers"
import type { Chat, ChatMessage } from "@/lib/green-api/types"
import { queryKeys } from "@/features/session/query-keys"
import { useAuthedSession } from "@/features/session/session-context"

import { createMessageCache } from "./message-cache"

const HISTORY_SIZE = 100

export function useMessageCache() {
  const queryClient = useQueryClient()
  const { credentials } = useAuthedSession()
  return useMemo(
    () => createMessageCache(queryClient, credentials.idInstance),
    [queryClient, credentials.idInstance],
  )
}

export function useChatHistory(chatId: string) {
  const { client, credentials } = useAuthedSession()
  return useQuery({
    queryKey: queryKeys.history(credentials.idInstance, chatId),
    // No abort signal: getChatHistory allows 1 request/second and aborted calls still count.
    queryFn: async () => normalizeMessages(await client.getChatHistory(chatId, HISTORY_SIZE)),
    // Kept up to date by the notification poller and optimistic sends;
    // a refetch would drop pending messages.
    staleTime: Infinity,
  })
}

export function useContactInfo(chat: Chat) {
  const { client, credentials } = useAuthedSession()
  return useQuery({
    queryKey: queryKeys.contact(credentials.idInstance, chat.chatId),
    queryFn: () => client.getContactInfo(chat.chatId),
    // GetContactInfo does not support groups.
    enabled: chat.type === "user",
    staleTime: 10 * 60_000,
    retry: false,
  })
}

/**
 * Marks a chat (or one message) as read in the messenger, so unread counters
 * are correct after a reload. Best effort: failures only cost a stale counter.
 */
export function useReadChat() {
  const { client } = useAuthedSession()
  return useCallback(
    (chatId: string, idMessage?: string) => {
      client.readChat(chatId, idMessage).catch((error: unknown) => console.warn("readChat failed", error))
    },
    [client],
  )
}

interface SendVariables {
  chatId: string
  text: string
  tempId: string
}

export function useSendMessage() {
  const { client } = useAuthedSession()
  const cache = useMessageCache()

  const mutation = useMutation({
    mutationFn: ({ chatId, text }: SendVariables) => client.sendMessage(chatId, text),
    onMutate: ({ chatId, text, tempId }) => {
      const message: ChatMessage = {
        id: tempId,
        chatId,
        direction: "outgoing",
        text,
        sentAt: Date.now(),
        status: "pending",
      }
      cache.addMessage(chatId, message)
    },
    onSuccess: ({ idMessage }, { chatId, tempId }) => {
      cache.confirmMessage(chatId, tempId, idMessage)
    },
    onError: (error, { chatId, tempId }) => {
      cache.setStatus(chatId, tempId, "failed")
      toast.error("Сообщение не отправлено", {
        description: describeError(error),
        testId: "toast-send-error",
      })
    },
  })

  return {
    send: (chatId: string, text: string) =>
      mutation.mutate({ chatId, text, tempId: `pending-${crypto.randomUUID()}` }),
    /** Re-sends a failed message as a new one. */
    retry: (message: ChatMessage) => {
      cache.removeMessage(message.chatId, message.id)
      mutation.mutate({
        chatId: message.chatId,
        text: message.text,
        tempId: `pending-${crypto.randomUUID()}`,
      })
    },
  }
}
