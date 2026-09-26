import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useState, type ReactNode } from "react"

import { clearChatHash } from "@/features/chats/chat-url"
import { clearCredentials, loadCredentials, saveCredentials } from "@/lib/credentials-storage"
import { createGreenApiClient } from "@/lib/green-api/client"
import { messengers } from "@/lib/green-api/messengers"
import type { Credentials } from "@/lib/green-api/types"

import { AuthedSessionContext, SessionContext, useSession } from "./session-context"

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [credentials, setCredentials] = useState(loadCredentials)

  const login = useCallback((next: Credentials) => {
    saveCredentials(next)
    setCredentials(next)
  }, [])

  const logout = useCallback(() => {
    clearCredentials()
    clearChatHash()
    setCredentials(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(() => ({ credentials, login, logout }), [credentials, login, logout])

  return <SessionContext value={value}>{children}</SessionContext>
}

export function AuthedSessionProvider({ children }: { children: ReactNode }) {
  const { credentials, logout } = useSession()
  if (!credentials) throw new Error("AuthedSessionProvider requires credentials")

  const value = useMemo(
    () => ({
      credentials,
      client: createGreenApiClient(credentials),
      messenger: messengers[credentials.messenger],
      logout,
    }),
    [credentials, logout],
  )

  return <AuthedSessionContext value={value}>{children}</AuthedSessionContext>
}
