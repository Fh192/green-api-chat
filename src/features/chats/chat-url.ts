import { useEffect, useEffectEvent } from "react"

// The open chat lives in the URL hash, like web.telegram.org/k/#@username.
// chatId works for every messenger: "10000000", "-1001234", "79991234567@c.us".

export function chatIdFromHash(hash = window.location.hash) {
  const value = decodeURIComponent(hash.replace(/^#/, ""))
  return value || null
}

function hashForChatId(chatId: string | null) {
  // "@" is valid in a fragment, keep WhatsApp ids readable.
  return chatId ? `#${encodeURIComponent(chatId).replaceAll("%40", "@")}` : ""
}

/** Removes the chat from the URL without adding a history entry (logout). */
export function clearChatHash() {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, "", pathname + search)
}

/**
 * Two-way sync between the selected chat and the URL hash.
 * Selecting a chat pushes a history entry, so the browser Back button closes it.
 */
export function useChatUrlSync(activeChatId: string | null, onNavigate: (chatId: string | null) => void) {
  useEffect(() => {
    if (chatIdFromHash() === activeChatId) return
    const { pathname, search } = window.location
    window.history.pushState(window.history.state, "", pathname + search + hashForChatId(activeChatId))
  }, [activeChatId])

  const handleNavigation = useEffectEvent(() => {
    const chatId = chatIdFromHash()
    if (chatId !== activeChatId) onNavigate(chatId)
  })

  useEffect(() => {
    const listener = () => handleNavigation()
    window.addEventListener("popstate", listener)
    window.addEventListener("hashchange", listener)
    return () => {
      window.removeEventListener("popstate", listener)
      window.removeEventListener("hashchange", listener)
    }
  }, [])
}
