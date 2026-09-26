import { lazy, Suspense } from "react"

import { Spinner } from "@/components/ui/spinner"
import { LoginScreen } from "@/features/auth/LoginScreen"
import { AuthedSessionProvider } from "@/features/session/SessionProvider"
import { useSession } from "@/features/session/session-context"

// The chat screen is loaded on demand, so the login screen ships a smaller bundle.
const ChatLayout = lazy(() => import("@/features/chats/ChatLayout").then((module) => ({ default: module.ChatLayout })))

export default function App() {
  const { credentials } = useSession()

  if (!credentials) return <LoginScreen />

  return (
    // Keyed by instance so switching accounts starts from a clean state.
    <AuthedSessionProvider key={credentials.idInstance}>
      <Suspense
        fallback={
          <div className="chat-backdrop flex h-dvh items-center justify-center" data-testid="app-loading">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        }
      >
        <ChatLayout />
      </Suspense>
    </AuthedSessionProvider>
  )
}
