import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useMemo } from "react"
import { Controller, useForm } from "react-hook-form"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatPhone } from "@/lib/format"
import { describeError } from "@/lib/green-api/errors"
import type { CheckTarget } from "@/lib/green-api/messengers"
import type { Chat } from "@/lib/green-api/types"
import { useAuthedSession } from "@/features/session/session-context"

import { createNewChatSchema, type NewChatFormInput, type NewChatFormOutput } from "./new-chat-schema"

interface NewChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChatFound: (chat: Chat) => void
}

export function NewChatDialog({ open, onOpenChange, onChatFound }: NewChatDialogProps) {
  const { client, messenger } = useAuthedSession()
  const schema = useMemo(() => createNewChatSchema(messenger), [messenger])

  const form = useForm<NewChatFormInput, unknown, NewChatFormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { contact: "" },
  })

  const check = useMutation({
    mutationFn: async (target: CheckTarget) => {
      const result = await messenger.checkAccount(client, target)
      if (!result.exists) return { ...result, name: undefined }
      // checkAccount has no name, so the list would show a bare phone number without this.
      const contact = await client.getContactInfo(result.chatId).catch(() => null)
      return { ...result, name: contact?.contactName || contact?.name || undefined }
    },
    onSuccess: (result, target) => {
      if (!result.exists) {
        form.setError("contact", {
          message:
            "username" in target
              ? `Пользователь ${target.username} не найден`
              : `У этого номера нет аккаунта ${messenger.label}`,
        })
        return
      }
      const username = result.username ?? ("username" in target ? target.username : undefined)
      const phoneNumber = result.phoneNumber ?? ("phoneNumber" in target ? target.phoneNumber : undefined)
      onChatFound({
        chatId: result.chatId,
        name: result.name ?? username ?? (phoneNumber ? formatPhone(phoneNumber) : result.chatId),
        type: "user",
        phoneNumber,
        username,
        aliases: result.aliases,
      })
      handleOpenChange(false)
    },
    onError: (error) => {
      form.setError("contact", { message: describeError(error) })
    },
  })

  function handleOpenChange(next: boolean) {
    if (!next) {
      form.reset()
      check.reset()
    }
    onOpenChange(next)
  }

  const placeholder = messenger.supportsUsername ? "+7 999 123-45-67 или @username" : "+7 999 123-45-67"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-testid="new-chat-dialog">
        <form
          onSubmit={form.handleSubmit((values) => check.mutate(values.contact))}
          noValidate
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Новый чат</DialogTitle>
            <DialogDescription>
              Проверим, что у собеседника есть аккаунт {messenger.label}, и откроем чат.
            </DialogDescription>
          </DialogHeader>

          <Controller
            name="contact"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="new-chat-contact">
                  {messenger.supportsUsername ? "Номер телефона или username" : "Номер телефона"}
                </FieldLabel>
                <Input
                  {...field}
                  id="new-chat-contact"
                  type={messenger.supportsUsername ? "text" : "tel"}
                  autoComplete="off"
                  autoFocus
                  placeholder={placeholder}
                  aria-invalid={fieldState.invalid}
                  data-testid="new-chat-input"
                />
                <FieldError errors={[fieldState.error]} data-testid="new-chat-error" />
              </Field>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} data-testid="new-chat-cancel">
              Отмена
            </Button>
            <Button type="submit" disabled={check.isPending} data-testid="new-chat-submit">
              {check.isPending && <Spinner />}
              Создать чат
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
