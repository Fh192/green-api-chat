import { RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { describeError } from "@/lib/green-api/errors"
import type { Chat } from "@/lib/green-api/types"
import { useAuthedSession } from "@/features/session/session-context"

import { ChatHeader } from "./ChatHeader"
import { MessageComposer } from "./MessageComposer"
import { MessageList } from "./MessageList"
import { useChatHistory, useSendMessage } from "./queries"

export function ChatWindow({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const { messenger } = useAuthedSession()
  const history = useChatHistory(chat.chatId)
  const { send, retry } = useSendMessage()

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label={`Чат ${chat.name}`}
      data-testid="chat-window"
      data-chat-id={chat.chatId}
    >
      <ChatHeader chat={chat} onBack={onBack} />

      {history.isPending ? (
        <div className="flex flex-1 items-center justify-center" data-testid="history-loading">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : history.isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center" data-testid="history-error">
          <p className="rounded-xl bg-black/40 px-4 py-2 text-sm">
            Не удалось загрузить историю: {describeError(history.error)}
          </p>
          <Button variant="secondary" size="sm" onClick={() => history.refetch()} data-testid="history-retry">
            <RefreshCwIcon />
            Повторить
          </Button>
        </div>
      ) : (
        <MessageList
          chatId={chat.chatId}
          messages={history.data}
          isGroup={chat.type === "group"}
          onRetry={retry}
        />
      )}

      <MessageComposer
        key={chat.chatId}
        maxLength={messenger.maxMessageLength}
        disabled={!history.isSuccess}
        onSend={(text) => send(chat.chatId, text)}
      />
    </section>
  )
}
