import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { describeError } from "@/lib/green-api/errors"
import type { InstanceSettings } from "@/lib/green-api/schemas"
import { describeInstanceState, getSettingsIssues, settingsFix } from "@/features/auth/instance"
import { queryKeys } from "@/features/session/query-keys"
import { useAuthedSession } from "@/features/session/session-context"

import type { PollerStatus } from "./use-notification-poller"

/** Warnings about instance state and HTTP API settings, shown above the chat list. */
export function InstanceAlerts({ pollerStatus }: { pollerStatus: PollerStatus }) {
  const { client, credentials } = useAuthedSession()
  const queryClient = useQueryClient()

  const state = useQuery({
    queryKey: queryKeys.state(credentials.idInstance),
    queryFn: () => client.getStateInstance(),
    staleTime: 60_000,
  })

  const settingsKey = queryKeys.settings(credentials.idInstance)
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => client.getSettings(),
    staleTime: Infinity,
  })

  const fixSettings = useMutation({
    mutationFn: (fix: Partial<InstanceSettings>) => client.setSettings(fix),
    onSuccess: (_result, fix) => {
      queryClient.setQueryData<InstanceSettings>(settingsKey, (current) => ({ ...current, ...fix }))
      toast.success("Настройки сохранены", {
        testId: "toast-settings-saved",
        description: "Инстанс перезапустится, изменения применятся в течение 5 минут",
      })
    },
    onError: (error) =>
      toast.error("Не удалось сохранить настройки", {
        description: describeError(error),
        testId: "toast-settings-error",
      }),
  })

  const stateInstance = state.data?.stateInstance
  const issues = settings.data ? getSettingsIssues(settings.data) : []

  return (
    <>
      {stateInstance && stateInstance !== "authorized" && (
        <Alert variant="destructive" data-testid="instance-state-alert">
          <TriangleAlertIcon />
          <AlertTitle>Инстанс недоступен</AlertTitle>
          <AlertDescription>{describeInstanceState(stateInstance)}</AlertDescription>
        </Alert>
      )}

      {issues.length > 0 && (
        <Alert data-testid="settings-alert">
          <TriangleAlertIcon />
          <AlertTitle>Инстанс настроен не для HTTP API</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {issues.map((issue) => (
                <li key={issue.message} data-testid="settings-issue">
                  {issue.message}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-2"
              disabled={fixSettings.isPending}
              onClick={() => fixSettings.mutate(settingsFix(settings.data))}
              data-testid="fix-settings"
            >
              {fixSettings.isPending && <Spinner />}
              Исправить автоматически
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {pollerStatus === "webhookSet" && issues.length === 0 && (
        <Alert variant="destructive" data-testid="webhook-alert">
          <TriangleAlertIcon />
          <AlertTitle>Сообщения не принимаются</AlertTitle>
          <AlertDescription>
            У инстанса задан webhookUrl. Очистите его в личном кабинете и подождите минуту.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}
