import { Fragment, useLayoutEffect, useRef } from "react"

import { formatDayLabel, isSameDay } from "@/lib/format"
import type { ChatMessage } from "@/lib/green-api/types"

import { MessageBubble } from "./MessageBubble"

// Measured after the new message is rendered, so it includes its height.
const STICK_TO_BOTTOM_PX = 300

interface MessageListProps {
  chatId: string
  messages: ChatMessage[]
  isGroup: boolean
  onRetry: (message: ChatMessage) => void
}

export function MessageList({ chatId, messages, isGroup, onRetry }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastChatId = useRef<string | null>(null)
  const lastCount = useRef(0)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const chatChanged = lastChatId.current !== chatId
    const added = messages.length > lastCount.current
    lastChatId.current = chatId
    lastCount.current = messages.length
    if (!chatChanged && !added) return

    const lastMessage = messages.at(-1)
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    // Follow new messages only if the user is reading the bottom or just sent one.
    if (chatChanged || distanceFromBottom < STICK_TO_BOTTOM_PX || lastMessage?.direction === "outgoing") {
      element.scrollTo({ top: element.scrollHeight, behavior: chatChanged ? "instant" : "smooth" })
    }
  }, [chatId, messages])

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      role="log"
      aria-label="Сообщения"
      data-testid="message-list"
    >
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end gap-1 px-3 py-4">
        {messages.length === 0 && (
          <p className="m-auto rounded-full bg-black/30 px-3 py-1 text-sm text-muted-foreground" data-testid="message-list-empty">
            Сообщений пока нет
          </p>
        )}
        {messages.map((message, index) => {
          const previous = messages[index - 1]
          const newDay = !previous || !isSameDay(previous.sentAt, message.sentAt)
          return (
            <Fragment key={message.id}>
              {newDay && (
                <div className="sticky top-2 z-10 my-2 flex justify-center">
                  <span className="rounded-full bg-black/40 px-3 py-0.5 text-sm font-medium backdrop-blur" data-testid="day-separator">
                    {formatDayLabel(message.sentAt)}
                  </span>
                </div>
              )}
              <MessageBubble
                message={message}
                showSender={isGroup && message.direction === "incoming" && previous?.senderName !== message.senderName}
                onRetry={onRetry}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
