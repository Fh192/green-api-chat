/**
 * In-memory GREEN-API used by unit tests (via msw) and e2e tests (via page.route).
 * Implements just enough of the HTTP API for the chat: same URLs, bodies and quirks.
 */

export interface FakeRequest {
  url: string
  body?: unknown
}

export interface FakeResponse {
  status: number
  body: unknown
}

interface FakeContact {
  chatId: string
  name: string
  phoneNumber: number
  username?: string
  /** getChats type; defaults to "user". */
  type?: string
}

interface FakeMessage {
  type: "incoming" | "outgoing"
  idMessage: string
  timestamp: number
  typeMessage: string
  chatId: string
  textMessage: string
  statusMessage?: string
  senderName?: string
  /** Incoming only, like the WhatsApp journal. */
  isRead?: boolean
  isForwarded?: boolean
  isEdited?: boolean
  isDeleted?: boolean
}

export const FAKE_CREDENTIALS = {
  apiUrl: "https://4100.api.green-api.com",
  idInstance: "4100123456",
  apiTokenInstance: "secret-token",
} as const

const URL_RE = /\/waInstance(\d+)\/(\w+)\/([^/?]+)(?:\/([^/?]+))?/

export class FakeGreenApi {
  stateInstance = "authorized"
  settings: Record<string, string> = {
    typeInstance: "telegram",
    webhookUrl: "",
    incomingWebhook: "yes",
    outgoingWebhook: "yes",
    outgoingMessageWebhook: "yes",
  }
  contacts: FakeContact[] = []
  /** Chats returned by getChats. */
  chats: FakeContact[] = []
  history = new Map<string, FakeMessage[]>()
  sent: { chatId: string; message: string }[] = []
  readChatCalls: { chatId: string; idMessage?: string }[] = []
  /** When set, sendMessage answers with this HTTP status. */
  sendMessageError: number | null = null
  /** How long an empty receiveNotification waits, ms (real API: receiveTimeout seconds). */
  receiveWaitMs = 300

  private queue: { receiptId: number; body: Record<string, unknown> }[] = []
  private waiters = new Set<() => void>()
  private nextReceiptId = 1
  private nextMessageId = 1000

  addContact(contact: FakeContact, { inChatList = true } = {}) {
    this.contacts.push(contact)
    if (inChatList) this.chats.push(contact)
  }

  addHistory(chatId: string, message: Omit<FakeMessage, "chatId" | "typeMessage" | "idMessage"> & { idMessage?: string }) {
    const list = this.history.get(chatId) ?? []
    list.push({
      typeMessage: "textMessage",
      chatId,
      idMessage: this.newMessageId(),
      isRead: message.type === "incoming" ? false : undefined,
      ...message,
    })
    this.history.set(chatId, list)
  }

  /** Simulates the recipient replying in the messenger. */
  receiveText(chatId: string, text: string, { sentAt = Date.now() } = {}) {
    const contact = this.contacts.find((item) => item.chatId === chatId)
    const idMessage = this.newMessageId()
    const timestamp = Math.floor(sentAt / 1000)
    this.addHistory(chatId, { type: "incoming", idMessage, timestamp, textMessage: text, senderName: contact?.name })
    this.pushNotification({
      typeWebhook: "incomingMessageReceived",
      instanceData: { idInstance: Number(FAKE_CREDENTIALS.idInstance), wid: "79990000000@c.us", typeInstance: "telegram" },
      timestamp,
      idMessage,
      senderData: {
        chatId,
        chatName: contact?.name ?? "",
        sender: chatId,
        senderName: contact?.name ?? "",
        chatType: contact?.type ?? "user",
      },
      messageData: { typeMessage: "textMessage", textMessageData: { textMessage: text } },
    })
    return idMessage
  }

  /** Simulates the sender editing a message in the messenger. */
  editText(chatId: string, idMessage: string, text: string) {
    const message = this.history.get(chatId)?.find((item) => item.idMessage === idMessage)
    if (message) Object.assign(message, { textMessage: text, isEdited: true })
    this.pushNotification(this.messageNotification(chatId, {
      typeMessage: "editedMessage",
      editedMessageData: { textMessage: text, stanzaId: idMessage },
    }))
  }

  /** Simulates the sender deleting a message in the messenger. */
  deleteMessage(chatId: string, idMessage: string) {
    const message = this.history.get(chatId)?.find((item) => item.idMessage === idMessage)
    if (message) message.isDeleted = true
    this.pushNotification(this.messageNotification(chatId, {
      typeMessage: "deletedMessage",
      deletedMessageData: { stanzaId: idMessage },
    }))
  }

  private messageNotification(chatId: string, messageData: Record<string, unknown>) {
    const contact = this.contacts.find((item) => item.chatId === chatId)
    return {
      typeWebhook: "incomingMessageReceived",
      instanceData: { idInstance: Number(FAKE_CREDENTIALS.idInstance), wid: "79990000000@c.us", typeInstance: "telegram" },
      timestamp: Math.floor(Date.now() / 1000),
      idMessage: this.newMessageId(),
      senderData: { chatId, chatName: contact?.name ?? "", sender: chatId, senderName: contact?.name ?? "" },
      messageData,
    }
  }

  pushNotification(body: Record<string, unknown>) {
    this.queue.push({ receiptId: this.nextReceiptId++, body })
    for (const wake of this.waiters) wake()
  }

  get pendingNotifications() {
    return this.queue.length
  }

  async handle({ url, body }: FakeRequest): Promise<FakeResponse> {
    const match = URL_RE.exec(url)
    if (!match) return { status: 404, body: { message: "Not found" } }
    const [, idInstance, apiMethod, token, suffix] = match

    if (idInstance !== FAKE_CREDENTIALS.idInstance) return { status: 404, body: { message: "Instance not found" } }
    if (token !== FAKE_CREDENTIALS.apiTokenInstance) return { status: 401, body: { message: "Unauthorized" } }

    const json = (body ?? {}) as Record<string, unknown>
    const ok = (data: unknown): FakeResponse => ({ status: 200, body: data })

    switch (apiMethod) {
      case "getStateInstance":
        return ok({ stateInstance: this.stateInstance })
      case "getSettings":
        return ok({ wid: "79990000000@c.us", ...this.settings })
      case "setSettings":
        Object.assign(this.settings, json)
        return ok({ saveSettings: true })
      case "checkAccount": {
        const contact = this.contacts.find(
          (item) => item.phoneNumber === json.phoneNumber || (item.username && item.username === json.username),
        )
        return ok(
          contact
            ? { exist: true, chatId: contact.chatId, username: contact.username, phoneNumber: contact.phoneNumber, fromCache: false }
            : { exist: false, chatId: "" },
        )
      }
      case "getChats":
        return ok(
          this.chats.map(({ chatId, name, phoneNumber, username, type }) => ({
            chatId,
            name,
            type: type ?? "user",
            phoneNumber,
            username: username ?? "",
          })),
        )
      case "getChatHistory": {
        const list = this.history.get(String(json.chatId)) ?? []
        // Real API returns newest first.
        return ok([...list].reverse().slice(0, Number(json.count ?? 100)))
      }
      case "lastIncomingMessages":
      case "lastOutgoingMessages": {
        const type = apiMethod === "lastIncomingMessages" ? "incoming" : "outgoing"
        return ok([...this.history.values()].flat().filter((message) => message.type === type).reverse())
      }
      case "readChat": {
        const chatId = String(json.chatId)
        const idMessage = json.idMessage === undefined ? undefined : String(json.idMessage)
        this.readChatCalls.push({ chatId, idMessage })
        for (const message of this.history.get(chatId) ?? []) {
          if (message.type === "incoming" && (!idMessage || message.idMessage === idMessage)) message.isRead = true
        }
        return ok({ setRead: true })
      }
      case "getContactInfo": {
        const contact = this.contacts.find((item) => item.chatId === json.chatId)
        if (!contact) return { status: 400, body: { message: "Bad Request" } }
        return ok({
          avatar: "",
          name: contact.name,
          contactName: "",
          chatId: contact.chatId,
          chatType: "user",
          lastSeen: 0,
          phoneNumber: contact.phoneNumber,
          username: contact.username ?? "",
        })
      }
      case "sendMessage": {
        if (this.sendMessageError) return { status: this.sendMessageError, body: { message: "Send failed" } }
        const chatId = String(json.chatId)
        const message = String(json.message)
        const idMessage = this.newMessageId()
        this.sent.push({ chatId, message })
        this.addHistory(chatId, {
          type: "outgoing",
          idMessage,
          timestamp: Math.floor(Date.now() / 1000),
          textMessage: message,
          statusMessage: "sent",
        })
        return ok({ idMessage })
      }
      case "receiveNotification": {
        if (this.settings.webhookUrl) {
          return { status: 400, body: { message: "Message cannot be received because custom webhook url is set" } }
        }
        if (this.queue.length === 0) await this.waitForNotification()
        return ok(this.queue[0] ?? null)
      }
      case "deleteNotification": {
        const receiptId = Number(suffix)
        const before = this.queue.length
        this.queue = this.queue.filter((item) => item.receiptId !== receiptId)
        return ok({ result: this.queue.length < before, reason: "" })
      }
      default:
        return { status: 404, body: { message: `Unknown method ${apiMethod}` } }
    }
  }

  private waitForNotification() {
    return new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer)
        this.waiters.delete(wake)
        resolve()
      }
      const timer = setTimeout(wake, this.receiveWaitMs)
      this.waiters.add(wake)
    })
  }

  private newMessageId() {
    return String(this.nextMessageId++)
  }
}
