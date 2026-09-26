import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useReducer, useRef } from "react"

import { cn } from "@/lib/utils"
import { formatPhone } from "@/lib/format"
import { isGroupChatId } from "@/lib/green-api/messengers"
import type { Chat } from "@/lib/green-api/types"
import { ChatWindow } from "@/features/chat/ChatWindow"
import { useReadChat } from "@/features/chat/queries"
import { queryKeys } from "@/features/session/query-keys"
import { useAuthedSession } from "@/features/session/session-context"

import { ChatUiContext, chatUiReducer, initialChatUiState, useChatUi } from "./chat-ui-context"
import { chatIdFromHash, useChatUrlSync } from "./chat-url"
import { findChat, useChatList } from "./queries"
import { Sidebar } from "./Sidebar"
import { useNotificationPoller } from "./use-notification-poller"

export function ChatLayout() {
  const [state, dispatch] = useReducer(chatUiReducer, initialChatUiState, (initial) => ({
    ...initial,
    activeChatId: chatIdFromHash(),
  }))

  const value = useMemo(() => ({ state, dispatch }), [state])

  return (
    <ChatUiContext value={value}>
      <ChatLayoutContent />
    </ChatUiContext>
  )
}

function ChatLayoutContent() {
  const { chats, isLoading, error, refetch } = useChatList()
  const pollerStatus = useNotificationPoller(chats)
  const { state, dispatch } = useChatUi()
  const readChat = useReadChat()

  const activeChat = state.activeChatId ? findChat(chats, state.activeChatId) : undefined
  const select = (chatId: string | null) => {
    if (chatId && state.unread[chatId]) readChat(chatId)
    dispatch({ type: "select", chatId })
  }

  useChatUrlSync(state.activeChatId, select)
  useChatFromUrl(chats, isLoading)

  const openChat = (chat: Chat) => {
    const existing = findChat(chats, chat.chatId)
    if (!existing) dispatch({ type: "addLocalChat", chat })
    select(existing?.chatId ?? chat.chatId)
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        chats={chats}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        activeChatId={activeChat?.chatId ?? null}
        onSelect={select}
        onChatFound={openChat}
        pollerStatus={pollerStatus}
        className={cn(
          "w-full border-r md:w-[22rem] md:shrink-0 lg:w-[26rem]",
          activeChat && "hidden md:flex",
        )}
      />
      <main className={cn("chat-backdrop min-w-0 flex-1 flex-col", activeChat ? "flex" : "hidden md:flex")}>
        {activeChat ? (
          <ChatWindow chat={activeChat} onBack={() => select(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="rounded-full bg-black/40 px-4 py-1 text-sm font-medium backdrop-blur" data-testid="no-chat-selected">
              Выберите чат, чтобы начать переписку
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

/**
 * Handles a chat opened straight from the URL (link or reload):
 * - marks it read, since select() was skipped and its unread counter isn't known yet;
 * - brings it back if getChats doesn't list it (e.g. a new chat without messages).
 * Refs make both one-off even under StrictMode's double effects.
 */
function useChatFromUrl(chats: Chat[], isLoading: boolean) {
  const { client, credentials } = useAuthedSession()
  const queryClient = useQueryClient()
  const { state, dispatch } = useChatUi()
  const readChat = useReadChat()
  const chatFromUrl = useRef(state.activeChatId)
  const markedRead = useRef(false)
  const restored = useRef(false)

  useEffect(() => {
    const chatId = chatFromUrl.current
    if (!chatId || markedRead.current) return
    markedRead.current = true
    readChat(chatId)
  }, [readChat])

  useEffect(() => {
    const chatId = chatFromUrl.current
    if (!chatId || isLoading || restored.current || findChat(chats, chatId)) return
    restored.current = true

    const isGroup = isGroupChatId(chatId)
    const addChat = (name: string, extra: Partial<Chat> = {}) =>
      dispatch({
        type: "addLocalChat",
        chat: { chatId, name, type: isGroup ? "group" : "user", aliases: [], ...extra },
      })
    if (isGroup) return addChat(chatId)

    // Same query as the chat header, so it is fetched once.
    queryClient
      .fetchQuery({
        queryKey: queryKeys.contact(credentials.idInstance, chatId),
        queryFn: () => client.getContactInfo(chatId),
        staleTime: 10 * 60_000,
      })
      .then((contact) => {
        const phoneNumber = Number(contact.phoneNumber) || undefined
        const username = contact.username || undefined
        addChat(
          contact.contactName || contact.name || username || (phoneNumber ? formatPhone(phoneNumber) : chatId),
          { phoneNumber, username },
        )
      })
      .catch(() => addChat(chatId))
  }, [chats, isLoading, client, credentials.idInstance, queryClient, dispatch])
}
