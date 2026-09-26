// Every key is scoped by instance so data of different logins never mixes.
export const queryKeys = {
  state: (idInstance: string) => ["instance", idInstance, "state"] as const,
  settings: (idInstance: string) => ["instance", idInstance, "settings"] as const,
  chats: (idInstance: string) => ["instance", idInstance, "chats"] as const,
  journal: (idInstance: string) => ["instance", idInstance, "journal"] as const,
  history: (idInstance: string, chatId: string) =>
    ["instance", idInstance, "history", chatId] as const,
  contact: (idInstance: string, chatId: string) =>
    ["instance", idInstance, "contact", chatId] as const,
}
