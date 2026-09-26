import { ChatAvatar } from "@/components/ChatAvatar"
import { MessageStatusIcon } from "@/components/MessageStatusIcon"
import { formatListDate } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { ChatListItem as ChatListItemData } from "./queries"

interface ChatListItemProps {
  chat: ChatListItemData
  active: boolean
  onSelect: (chatId: string) => void
}

export function ChatListItem({ chat, active, onSelect }: ChatListItemProps) {
  const { lastMessage } = chat
  const preview = lastMessage
    ? lastMessage.direction === "outgoing" && chat.type === "group"
      ? `Вы: ${lastMessage.text}`
      : lastMessage.text
    : (chat.username ?? "")

  return (
    <button
      type="button"
      onClick={() => onSelect(chat.chatId)}
      aria-current={active ? "true" : undefined}
      data-testid={`chat-item-${chat.chatId}`}
      data-active={active}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-primary text-primary-foreground" : "hover:bg-sidebar-accent",
      )}
    >
      <ChatAvatar chatId={chat.chatId} name={chat.name} isGroup={chat.type === "group"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium" data-testid="chat-item-name">
            {chat.name}
          </span>
          {lastMessage && (
            <span
              className={cn(
                "ml-auto flex shrink-0 items-center gap-1 text-xs",
                active ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {lastMessage.direction === "outgoing" && lastMessage.status && (
                <MessageStatusIcon
                  status={lastMessage.status}
                  className={cn(!active && lastMessage.status !== "failed" && "text-primary")}
                />
              )}
              {formatListDate(lastMessage.sentAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              active ? "text-primary-foreground/80" : "text-muted-foreground",
              lastMessage?.isDeleted && "line-through",
            )}
            data-testid="chat-item-preview"
            data-deleted={lastMessage?.isDeleted || undefined}
          >
            {preview}
          </span>
          {chat.unread > 0 && (
            <span
              aria-label={`Непрочитанных: ${chat.unread}`}
              data-testid="chat-item-unread"
              className={cn(
                "ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
              )}
            >
              {chat.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
