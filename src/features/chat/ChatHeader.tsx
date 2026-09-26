import { ArrowLeftIcon } from "lucide-react"

import { ChatAvatar } from "@/components/ChatAvatar"
import { Button } from "@/components/ui/button"
import { formatLastSeen, formatPhone } from "@/lib/format"
import type { Chat } from "@/lib/green-api/types"

import { useContactInfo } from "./queries"

export function ChatHeader({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const contact = useContactInfo(chat).data

  const name = contact?.contactName || contact?.name || chat.name
  const phone = contact?.phoneNumber ?? chat.phoneNumber
  const username = contact?.username || chat.username
  const subtitle =
    chat.type === "group"
      ? "группа"
      : contact?.lastSeen
        ? formatLastSeen(contact.lastSeen * 1000)
        : [username, phone ? formatPhone(phone) : undefined].filter(Boolean).join(" · ")

  return (
    <header className="flex items-center gap-3 border-b bg-sidebar px-3 py-2">
      <Button
        variant="ghost"
        size="icon-lg"
        className="rounded-full md:hidden"
        aria-label="Назад к чатам"
        onClick={onBack}
        data-testid="chat-back"
      >
        <ArrowLeftIcon className="size-5" />
      </Button>
      <ChatAvatar
        chatId={chat.chatId}
        name={name}
        src={contact?.avatar}
        isGroup={chat.type === "group"}
        className="size-10"
      />
      <div className="min-w-0">
        <h2 className="truncate font-medium" data-testid="chat-header-name">
          {name}
        </h2>
        {subtitle && (
          <p className="truncate text-sm text-muted-foreground" data-testid="chat-header-subtitle">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  )
}
