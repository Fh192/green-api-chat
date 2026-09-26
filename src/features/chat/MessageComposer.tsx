import { zodResolver } from "@hookform/resolvers/zod"
import { SendHorizontalIcon } from "lucide-react"
import { useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"

import { Button } from "@/components/ui/button"

import { createMessageSchema, type MessageFormValues } from "./message-schema"

interface MessageComposerProps {
  maxLength: number
  disabled?: boolean
  onSend: (text: string) => void
}

export function MessageComposer({ maxLength, disabled, onSend }: MessageComposerProps) {
  const schema = useMemo(() => createMessageSchema(maxLength), [maxLength])
  const form = useForm<MessageFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { text: "" },
  })

  const text = useWatch({ control: form.control, name: "text" })
  const error = form.formState.errors.text
  const tooLong = text.length > maxLength

  const submit = form.handleSubmit(({ text }) => {
    onSend(text)
    form.reset()
    form.setFocus("text")
  })

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl items-end gap-2 px-3 pb-4" aria-label="Отправка сообщения" data-testid="message-form">
      <div className="flex min-w-0 flex-1 flex-col rounded-2xl bg-sidebar px-4 py-2.5 shadow-sm">
        <textarea
          {...form.register("text")}
          rows={1}
          placeholder="Сообщение"
          aria-label="Сообщение"
          aria-invalid={Boolean(error) || tooLong}
          disabled={disabled}
          data-testid="message-input"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
          }}
          className="max-h-40 min-h-6 resize-none bg-transparent leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:opacity-50"
        />
        {(tooLong || (error && text.trim())) && (
          <p className="pt-1 text-xs text-destructive" role="alert" data-testid="message-error">
            {tooLong ? `${text.length} / ${maxLength} символов` : error?.message}
          </p>
        )}
      </div>
      <Button
        type="submit"
        size="icon-lg"
        className="size-12 shrink-0 rounded-full"
        aria-label="Отправить"
        data-testid="message-send"
        disabled={disabled || !text.trim() || tooLong}
      >
        <SendHorizontalIcon className="size-5" />
      </Button>
    </form>
  )
}
