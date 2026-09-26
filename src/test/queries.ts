import { screen, waitFor, within } from "@testing-library/react"

/** Message bubble with exactly this text, or null. */
export function queryMessage(text: string) {
  return (
    screen
      .queryAllByTestId("message")
      .find((message) => within(message).getByTestId("message-text").textContent === text) ?? null
  )
}

export function getMessage(text: string) {
  const message = queryMessage(text)
  if (!message) throw new Error(`Message "${text}" not found`)
  return message
}

export function findMessage(text: string) {
  return waitFor(() => getMessage(text))
}

export function getChatItem(chatId: string) {
  return screen.getByTestId(`chat-item-${chatId}`)
}

export function findChatItem(chatId: string) {
  return screen.findByTestId(`chat-item-${chatId}`)
}
