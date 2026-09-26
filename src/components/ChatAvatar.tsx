import { UsersIcon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { avatarColor, initials } from "@/lib/format"
import { cn } from "@/lib/utils"

interface ChatAvatarProps {
  chatId: string
  name: string
  src?: string | null
  isGroup?: boolean
  className?: string
}

export function ChatAvatar({ chatId, name, src, isGroup, className }: ChatAvatarProps) {
  return (
    <Avatar className={cn("size-12", className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className={cn("font-medium text-white", avatarColor(chatId))}>
        {isGroup ? <UsersIcon className="size-1/2" /> : initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
