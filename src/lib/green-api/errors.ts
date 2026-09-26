export class GreenApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "GreenApiError"
    this.status = status
  }

  get isRateLimited() {
    return this.status === 429
  }

  get isRetryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }

  get isWebhookUrlSet() {
    return /webhook url is set/i.test(this.message)
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

/** Human-readable text for toasts and form errors. */
export function describeError(error: unknown): string {
  if (!(error instanceof GreenApiError)) {
    return error instanceof Error ? error.message : "Неизвестная ошибка"
  }
  if (error.status === 0) return "Нет соединения с GREEN-API"
  if (error.status === 401 || error.status === 403) {
    return "Неверный idInstance или apiTokenInstance"
  }
  if (error.status === 429) return "Слишком много запросов, попробуйте чуть позже"
  if (error.status === 466) return "Исчерпан лимит тарифа инстанса"
  if (error.isWebhookUrlSet) {
    return "У инстанса задан webhookUrl — очистите его, чтобы получать сообщения"
  }
  return error.message || `Ошибка GREEN-API (${error.status})`
}
