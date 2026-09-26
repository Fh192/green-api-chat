import { z } from "zod"

export const loginSchema = z.object({
  messenger: z.enum(["telegram", "whatsapp", "max"]),
  apiUrl: z
    .string()
    .trim()
    .min(1, "Укажите apiUrl")
    // The token travels in the URL path, so plain http is not allowed.
    .pipe(z.url({ protocol: /^https$/, error: "Введите адрес вида https://1234.api.green-api.com" })),
  idInstance: z
    .string()
    .trim()
    .min(1, "Укажите idInstance")
    .regex(/^\d+$/, "idInstance состоит только из цифр"),
  apiTokenInstance: z.string().trim().min(1, "Укажите apiTokenInstance"),
})

/** GREEN-API host for an instance, derived from the first 4 digits of idInstance. */
export function suggestedApiUrl(idInstance: string) {
  const digits = idInstance.trim()
  return /^\d{4,}$/.test(digits) ? `https://${digits.slice(0, 4)}.api.green-api.com` : ""
}

export type LoginFormValues = z.infer<typeof loginSchema>
