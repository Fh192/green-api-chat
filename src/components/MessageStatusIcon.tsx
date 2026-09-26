import { AlertCircleIcon, CheckCheckIcon, CheckIcon, ClockIcon } from "lucide-react"

import type { MessageStatus } from "@/lib/green-api/types"
import { cn } from "@/lib/utils"

const LABELS: Record<MessageStatus, string> = {
  pending: "Отправляется",
  sent: "Отправлено",
  delivered: "Доставлено",
  read: "Прочитано",
  failed: "Не отправлено",
}

const ICONS = {
  pending: ClockIcon,
  failed: AlertCircleIcon,
  // Like Telegram: one check until the recipient has read the message.
  sent: CheckIcon,
  delivered: CheckIcon,
  read: CheckCheckIcon,
} satisfies Record<MessageStatus, unknown>

interface MessageStatusIconProps {
  status: MessageStatus
  className?: string
  "data-testid"?: string
}

export function MessageStatusIcon({ status, className, ...props }: MessageStatusIconProps) {
  const Icon = ICONS[status]

  return (
    <Icon
      role="img"
      aria-label={LABELS[status]}
      data-status={status}
      {...props}
      className={cn("size-3.5 shrink-0", status === "failed" && "text-destructive", className)}
    />
  )
}
