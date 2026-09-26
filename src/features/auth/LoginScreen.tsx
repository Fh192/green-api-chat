import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MessageCircleIcon } from "lucide-react"
import { Controller, useForm } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { messengerList } from "@/lib/green-api/messengers"
import type { Credentials } from "@/lib/green-api/types"
import { queryKeys } from "@/features/session/query-keys"
import { useSession } from "@/features/session/session-context"

import { LoginError, verifyInstance } from "./instance"
import { loginSchema, suggestedApiUrl, type LoginFormValues } from "./login-schema"

const messengerItems = messengerList.map(({ id, label }) => ({ value: id, label }))

export function LoginScreen() {
  const { login } = useSession()
  const queryClient = useQueryClient()

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { messenger: "telegram", apiUrl: "", idInstance: "", apiTokenInstance: "" },
  })

  const verify = useMutation({
    mutationFn: verifyInstance,
    onSuccess: (settings, credentials) => {
      // Seed what verifyInstance already fetched, so the chat screen doesn't repeat it (1 req/s limits).
      queryClient.setQueryData(queryKeys.settings(credentials.idInstance), settings)
      queryClient.setQueryData(queryKeys.state(credentials.idInstance), { stateInstance: "authorized" })
      login(credentials)
    },
    onError: (error) => {
      if (error instanceof LoginError && error.field !== "root") {
        form.setError(error.field, { message: error.message }, { shouldFocus: true })
      }
    },
  })

  // apiUrl usually is https://{first 4 digits of idInstance}.api.green-api.com, but not
  // always (some instances live on api.greenapi.com), so it is only a suggestion the
  // user can overwrite; once edited by hand it is left alone.
  const suggestApiUrl = (idInstance: string) => {
    if (form.getFieldState("apiUrl").isDirty) return
    const suggestion = suggestedApiUrl(idInstance)
    form.setValue("apiUrl", suggestion, { shouldValidate: form.formState.isSubmitted })
  }

  const onSubmit = (values: LoginFormValues) => {
    verify.reset()
    verify.mutate(values satisfies Credentials)
  }

  const rootError =
    verify.error && (!(verify.error instanceof LoginError) || verify.error.field === "root")
      ? verify.error.message
      : null

  return (
    <main className="chat-backdrop flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-sidebar p-6 shadow-2xl ring-1 ring-foreground/10">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageCircleIcon className="size-7" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">GREEN-API Chat</h1>
            <p className="text-sm text-muted-foreground">
              Данные инстанса из{" "}
              <a
                href="https://console.green-api.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                личного кабинета
              </a>
            </p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Вход" data-testid="login-form">
          <FieldGroup>
            <Controller
              name="messenger"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="messenger">Мессенджер</FieldLabel>
                  <Select
                    items={messengerItems}
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                  >
                    <SelectTrigger
                      id="messenger"
                      className="w-full"
                      aria-invalid={fieldState.invalid}
                      data-testid="login-messenger"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {messengerItems.map((item) => (
                        <SelectItem key={item.value} value={item.value} data-testid={`login-messenger-${item.value}`}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[fieldState.error]} data-testid="login-messenger-error" />
                </Field>
              )}
            />

            <Controller
              name="idInstance"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="idInstance">idInstance</FieldLabel>
                  <Input
                    {...field}
                    onChange={(event) => {
                      field.onChange(event)
                      suggestApiUrl(event.target.value)
                    }}
                    id="idInstance"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="4100123456"
                    aria-invalid={fieldState.invalid}
                    data-testid="login-id-instance"
                  />
                  <FieldError errors={[fieldState.error]} data-testid="login-id-instance-error" />
                </Field>
              )}
            />

            <Controller
              name="apiUrl"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="apiUrl">apiUrl</FieldLabel>
                  <Input
                    {...field}
                    id="apiUrl"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://4100.api.green-api.com"
                    aria-invalid={fieldState.invalid}
                    data-testid="login-api-url"
                  />
                  <FieldError errors={[fieldState.error]} data-testid="login-api-url-error" />
                  <FieldDescription>Подставляется по idInstance, сверьте с личным кабинетом.</FieldDescription>
                </Field>
              )}
            />

            <Controller
              name="apiTokenInstance"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="apiTokenInstance">apiTokenInstance</FieldLabel>
                  <Input
                    {...field}
                    id="apiTokenInstance"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                    data-testid="login-api-token"
                  />
                  <FieldError errors={[fieldState.error]} data-testid="login-api-token-error" />
                  <FieldDescription>Данные сохраняются только в этом браузере.</FieldDescription>
                </Field>
              )}
            />

            {rootError && (
              <Alert variant="destructive" data-testid="login-error">
                <AlertDescription>{rootError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={verify.isPending} data-testid="login-submit">
              {verify.isPending && <Spinner />}
              Войти
            </Button>
          </FieldGroup>
        </form>
      </div>
    </main>
  )
}
