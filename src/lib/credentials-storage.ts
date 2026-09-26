import { z } from "zod"

import type { Credentials } from "@/lib/green-api/types"

const STORAGE_KEY = "green-api-chat:credentials"

const storedCredentialsSchema = z.object({
  messenger: z.enum(["telegram", "whatsapp", "max"]),
  apiUrl: z.string().min(1),
  idInstance: z.string().min(1),
  apiTokenInstance: z.string().min(1),
})

export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = storedCredentialsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveCredentials(credentials: Credentials) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
  } catch {
    // Storage may be unavailable (private mode) — the session still works in memory.
  }
}

export function clearCredentials() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
