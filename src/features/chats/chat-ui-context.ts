import { createContext, useContext } from "react"

import type { Chat } from "@/lib/green-api/types"

export interface ChatUiState {
  activeChatId: string | null
  /** Chats created in this session (new chat dialog, unknown incoming) that getChats may not list yet. */
  localChats: Chat[]
  unread: Record<string, number>
  /** Whether unread counters were initialized from the server after load. */
  unreadSeeded: boolean
}

export type ChatUiAction =
  | { type: "select"; chatId: string | null }
  | { type: "addLocalChat"; chat: Chat }
  | { type: "incrementUnread"; chatId: string }
  | { type: "seedUnread"; counts: Record<string, number> }

export const initialChatUiState: ChatUiState = {
  activeChatId: null,
  localChats: [],
  unread: {},
  unreadSeeded: false,
}

export function chatUiReducer(state: ChatUiState, action: ChatUiAction): ChatUiState {
  switch (action.type) {
    case "select": {
      if (!action.chatId) return { ...state, activeChatId: null }
      const unread = { ...state.unread }
      delete unread[action.chatId]
      return { ...state, activeChatId: action.chatId, unread }
    }
    case "addLocalChat":
      if (state.localChats.some((chat) => chat.chatId === action.chat.chatId)) return state
      return { ...state, localChats: [action.chat, ...state.localChats] }
    case "incrementUnread":
      if (action.chatId === state.activeChatId) return state
      return {
        ...state,
        unread: { ...state.unread, [action.chatId]: (state.unread[action.chatId] ?? 0) + 1 },
      }
    case "seedUnread": {
      // Notifications may already have counted some of these messages — take the max, not the sum.
      const unread = { ...state.unread }
      for (const [chatId, count] of Object.entries(action.counts)) {
        if (chatId !== state.activeChatId) unread[chatId] = Math.max(unread[chatId] ?? 0, count)
      }
      return { ...state, unread, unreadSeeded: true }
    }
  }
}

export interface ChatUiContextValue {
  state: ChatUiState
  dispatch: React.Dispatch<ChatUiAction>
}

export const ChatUiContext = createContext<ChatUiContextValue | null>(null)

export function useChatUi() {
  const value = useContext(ChatUiContext)
  if (!value) throw new Error("useChatUi must be used inside ChatUiContext")
  return value
}
