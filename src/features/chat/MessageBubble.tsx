import { ForwardIcon, RotateCwIcon, Trash2Icon } from "lucide-react"

import { MessageStatusIcon } from "@/components/MessageStatusIcon"
import { Button } from "@/components/ui/button"
import { formatTime } from "@/lib/format"
import type { ChatMessage } from "@/lib/green-api/types"
import { cn } from "@/lib/utils"

interface MessageBubbleProps {
  message: ChatMessage
  showSender: boolean
  onRetry: (message: ChatMessage) => void
}

export function MessageBubble({ message, showSender, onRetry }: MessageBubbleProps) {
  const outgoing = message.direction === "outgoing"
  const { isForwarded, isEdited, isDeleted } = message

  return (
    <div
      className={cn("flex items-end gap-2", outgoing ? "justify-end" : "justify-start")}
      data-testid="message"
      data-direction={message.direction}
      data-status={message.status}
      data-forwarded={isForwarded || undefined}
      data-edited={isEdited || undefined}
      data-deleted={isDeleted || undefined}
    >
      {message.status === "failed" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-destructive"
          aria-label="Отправить повторно"
          data-testid="message-retry"
          onClick={() => onRetry(message)}
        >
          <RotateCwIcon />
        </Button>
      )}
      <div
        className={cn(
          "max-w-[min(80%,36rem)] rounded-2xl px-3 py-1.5 shadow-sm",
          outgoing
            ? "rounded-br-md bg-bubble-outgoing text-primary-foreground"
            : "rounded-bl-md bg-bubble-incoming text-foreground",
          isDeleted && "opacity-60",
        )}
      >
        {showSender && message.senderName && (
          <p className="text-sm font-medium text-primary" data-testid="message-sender">
            {message.senderName}
          </p>
        )}
        {isForwarded && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              outgoing ? "text-primary-foreground/80" : "text-primary",
            )}
            data-testid="message-forwarded"
          >
            <ForwardIcon className="size-3.5" />
            Пересланное сообщение
          </p>
        )}
        <p className="break-words whitespace-pre-wrap">
          <span data-testid="message-text" className={cn(isDeleted && "line-through decoration-1")}>
            {message.text}
          </span>
          {/* Invisible copy of the meta reserves exactly its width at the end of the
              last line, so the floating meta never overlaps the text. */}
          <MessageMeta message={message} className="invisible ml-2 inline-flex" placeholder />
        </p>
        <MessageMeta
          message={message}
          className={cn(
            "float-right -mt-4 flex",
            outgoing ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        />
      </div>
    </div>
  )
}

interface MessageMetaProps {
  message: ChatMessage
  className?: string
  /** Width-reserving copy: hidden from assistive tech and tests. */
  placeholder?: boolean
}

function MessageMeta({ message, className, placeholder }: MessageMetaProps) {
  const testId = (id: string) => (placeholder ? undefined : id)
  return (
    <span
      className={cn("items-center gap-1 text-[0.7rem] leading-none", className)}
      aria-hidden={placeholder || undefined}
    >
      {message.isDeleted && (
        <span className="flex items-center gap-0.5" data-testid={testId("message-deleted")}>
          <Trash2Icon className="size-3" />
          удалено
        </span>
      )}
      {message.isEdited && <span data-testid={testId("message-edited")}>изменено</span>}
      {formatTime(message.sentAt)}
      {message.direction === "outgoing" && message.status && (
        <MessageStatusIcon status={message.status} data-testid={testId("message-status")} />
      )}
    </span>
  )
}
