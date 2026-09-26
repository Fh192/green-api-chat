import { createContext, useContext } from "react"

import type { GreenApiClient } from "@/lib/green-api/client"
import type { MessengerAdapter } from "@/lib/green-api/messengers"
import type { Credentials } from "@/lib/green-api/types"

export interface SessionContextValue {
  credentials: Credentials | null
  login: (credentials: Credentials) => void
  logout: () => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error("useSession must be used inside SessionProvider")
  return value
}

export interface AuthedSession {
  credentials: Credentials
  client: GreenApiClient
  messenger: MessengerAdapter
  logout: () => void
}

export const AuthedSessionContext = createContext<AuthedSession | null>(null)

/** Session of a logged-in user; only available below the chat layout. */
export function useAuthedSession() {
  const value = useContext(AuthedSessionContext)
  if (!value) throw new Error("useAuthedSession must be used inside AuthedSessionProvider")
  return value
}
