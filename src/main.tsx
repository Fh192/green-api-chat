import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { Toaster } from "@/components/ui/sonner"
import { SessionProvider } from "@/features/session/SessionProvider"
import { createQueryClient } from "@/lib/query-client"

import App from "./App.tsx"
import "./index.css"

const queryClient = createQueryClient()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App />
        <Toaster position="top-center" />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
)
