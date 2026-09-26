import { QueryClientProvider } from "@tanstack/react-query"
import { render } from "@testing-library/react"
import { StrictMode } from "react"

import App from "@/App"
import { Toaster } from "@/components/ui/sonner"
import { SessionProvider } from "@/features/session/SessionProvider"
import { createQueryClient } from "@/lib/query-client"

import { FAKE_CREDENTIALS } from "./fake-green-api"

export function logIn() {
  localStorage.setItem(
    "green-api-chat:credentials",
    JSON.stringify({ ...FAKE_CREDENTIALS, messenger: "telegram" }),
  )
}

export function renderApp() {
  const queryClient = createQueryClient()
  // StrictMode like in main.tsx, so double effects show up in tests too.
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <App />
          <Toaster />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
