import { LogOutIcon, MenuIcon, PencilIcon, RefreshCwIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { describeError } from "@/lib/green-api/errors"
import type { Chat } from "@/lib/green-api/types"
import { cn } from "@/lib/utils"
import { useAuthedSession } from "@/features/session/session-context"

import { ChatListItem } from "./ChatListItem"
import { InstanceAlerts } from "./InstanceAlerts"
import { NewChatDialog } from "./NewChatDialog"
import type { ChatListItem as ChatListItemData } from "./queries"
import type { PollerStatus } from "./use-notification-poller"

interface SidebarProps {
  chats: ChatListItemData[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  activeChatId: string | null
  onSelect: (chatId: string) => void
  onChatFound: (chat: Chat) => void
  pollerStatus: PollerStatus
  className?: string
}

const STATUS_TITLE: Partial<Record<PollerStatus, string>> = {
  offline: "Ожидание сети…",
}

export function Sidebar({
  chats,
  isLoading,
  error,
  onRetry,
  activeChatId,
  onSelect,
  onChatFound,
  pollerStatus,
  className,
}: SidebarProps) {
  const { credentials, messenger, logout } = useAuthedSession()
  const [newChatOpen, setNewChatOpen] = useState(false)

  return (
    <aside className={cn("relative flex min-h-0 flex-col bg-sidebar", className)}>
      <header className="flex items-center gap-2 px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="rounded-full"
                aria-label="Меню"
                data-testid="sidebar-menu"
              />
            }
          >
            <MenuIcon className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {messenger.label} · инстанс {credentials.idInstance}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={logout} data-testid="logout">
              <LogOutIcon />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="text-lg font-semibold" aria-live="polite" data-testid="sidebar-title">
          {STATUS_TITLE[pollerStatus] ?? `Чаты ${messenger.label}`}
        </h1>
      </header>

      <div className="flex flex-col gap-2 px-3 empty:hidden">
        <InstanceAlerts pollerStatus={pollerStatus} />
      </div>

      <nav aria-label="Чаты" className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-24" data-testid="chat-list">
        {isLoading ? (
          <ChatListSkeleton />
        ) : error && chats.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground"
            data-testid="chat-list-error"
          >
            <p>Не удалось загрузить чаты: {describeError(error)}</p>
            <Button variant="outline" size="sm" onClick={onRetry} data-testid="chat-list-retry">
              <RefreshCwIcon />
              Повторить
            </Button>
          </div>
        ) : chats.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="chat-list-empty">
            Чатов пока нет. Нажмите на карандаш, чтобы начать переписку.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => (
              <li key={chat.chatId}>
                <ChatListItem chat={chat} active={chat.chatId === activeChatId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </nav>

      <Button
        size="icon-lg"
        className="absolute right-5 bottom-5 size-14 rounded-full shadow-lg"
        aria-label="Новый чат"
        data-testid="new-chat-button"
        onClick={() => setNewChatOpen(true)}
      >
        <PencilIcon className="size-6" />
      </Button>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onChatFound={onChatFound} />
    </aside>
  )
}

function ChatListSkeleton() {
  return (
    <div className="flex flex-col gap-1" aria-label="Загрузка чатов" data-testid="chat-list-loading">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
