import { createGreenApiClient } from "@/lib/green-api/client"
import { GreenApiError } from "@/lib/green-api/errors"
import { messengerByTypeInstance, messengers } from "@/lib/green-api/messengers"
import type { InstanceSettings } from "@/lib/green-api/schemas"
import type { Credentials } from "@/lib/green-api/types"

export type LoginField = keyof Credentials | "root"

export class LoginError extends Error {
  readonly field: LoginField

  constructor(field: LoginField, message: string) {
    super(message)
    this.name = "LoginError"
    this.field = field
  }
}

const STATE_MESSAGES: Record<string, string> = {
  notAuthorized: "Инстанс не авторизован. Авторизуйте его в личном кабинете GREEN-API",
  starting: "Инстанс запускается. Попробуйте через пару минут",
  blocked: "Аккаунт мессенджера заблокирован",
  suspended: "На аккаунт наложены временные ограничения",
  pendingPassword: "Инстанс ждёт пароль двухфакторной аутентификации. Завершите авторизацию в личном кабинете",
  yellowCard: "Отправка сообщений временно ограничена мессенджером",
  sleepMode: "Инстанс в спящем режиме. Откройте мессенджер на телефоне",
}

export function describeInstanceState(state: string) {
  return STATE_MESSAGES[state] ?? `Инстанс недоступен (${state})`
}

function toLoginError(error: unknown): LoginError {
  if (error instanceof LoginError) return error
  if (error instanceof GreenApiError) {
    if (error.status === 0) {
      return new LoginError("apiUrl", "Не удалось подключиться. Проверьте apiUrl")
    }
    if (error.status === 401 || error.status === 403) {
      return new LoginError("apiTokenInstance", "Неверный idInstance или apiTokenInstance")
    }
    if (error.status === 404) {
      return new LoginError("idInstance", "Инстанс не найден. Проверьте apiUrl и idInstance")
    }
  }
  return new LoginError("root", error instanceof Error ? error.message : "Не удалось войти")
}

/**
 * Checks that credentials work, the instance is authorized and it really is the
 * selected messenger. Returns instance settings for the settings banner.
 */
export async function verifyInstance(credentials: Credentials): Promise<InstanceSettings> {
  const client = createGreenApiClient(credentials)
  try {
    const { stateInstance } = await client.getStateInstance()
    if (stateInstance !== "authorized") {
      throw new LoginError("root", describeInstanceState(stateInstance))
    }

    const settings = await client.getSettings()
    const actual = messengerByTypeInstance(settings.typeInstance)
    if (actual && actual.id !== credentials.messenger) {
      const selected = messengers[credentials.messenger].label
      throw new LoginError(
        "messenger",
        `Это инстанс ${actual.label}, а выбран ${selected}. Выберите ${actual.label}`,
      )
    }
    return settings
  } catch (error) {
    throw toLoginError(error)
  }
}

/** Settings required to receive messages and statuses via HTTP API. */
const REQUIRED_SETTINGS = {
  webhookUrl: "",
  incomingWebhook: "yes",
  outgoingWebhook: "yes",
  outgoingMessageWebhook: "yes",
} satisfies Partial<InstanceSettings>

/** Not every messenger has these (WhatsApp settings lack them), so they are sent only when present. */
const OPTIONAL_SETTINGS = {
  editedMessageWebhook: "yes",
  deletedMessageWebhook: "yes",
} satisfies Partial<InstanceSettings>

/** setSettings payload that fixes every issue from getSettingsIssues. */
export function settingsFix(settings: InstanceSettings | undefined): Partial<InstanceSettings> {
  const optional = Object.fromEntries(
    Object.entries(OPTIONAL_SETTINGS).filter(([key]) => settings?.[key as keyof InstanceSettings] !== undefined),
  )
  return { ...REQUIRED_SETTINGS, ...optional }
}

export interface SettingsIssue {
  message: string
  /** Critical issues break receiving messages altogether. */
  critical: boolean
}

export function getSettingsIssues(settings: InstanceSettings): SettingsIssue[] {
  const issues: SettingsIssue[] = []
  if (settings.webhookUrl) {
    issues.push({ critical: true, message: "Задан webhookUrl, из-за него HTTP API не получает уведомления" })
  }
  if (settings.incomingWebhook === "no") {
    issues.push({ critical: true, message: "Выключены уведомления о входящих сообщениях" })
  }
  if (settings.outgoingWebhook === "no") {
    issues.push({ critical: false, message: "Выключены статусы отправленных сообщений" })
  }
  if (settings.outgoingMessageWebhook === "no") {
    issues.push({ critical: false, message: "Выключены уведомления о сообщениях, отправленных с телефона" })
  }
  if (settings.editedMessageWebhook === "no" || settings.deletedMessageWebhook === "no") {
    issues.push({ critical: false, message: "Выключены уведомления об изменённых и удалённых сообщениях" })
  }
  return issues
}
