import { z } from "zod"

import type { CheckTarget, MessengerAdapter } from "@/lib/green-api/messengers"

const USERNAME_RE = /^@[A-Za-z0-9_]{4,32}$/

export function createNewChatSchema(messenger: MessengerAdapter) {
  const { minDigits, maxDigits, countryCodes } = messenger.phone

  return z.object({
    contact: z
      .string()
      .trim()
      .min(1, messenger.supportsUsername ? "Введите номер телефона или @username" : "Введите номер телефона")
      .transform((value, ctx): CheckTarget => {
        if (value.startsWith("@")) {
          if (!messenger.supportsUsername) {
            ctx.addIssue({ code: "custom", message: `${messenger.label} ищет только по номеру телефона` })
            return z.NEVER
          }
          if (!USERNAME_RE.test(value)) {
            ctx.addIssue({ code: "custom", message: "Username: латиница, цифры и _, от 5 символов" })
            return z.NEVER
          }
          return { username: value }
        }

        const digits = value.replace(/[\s()+-]/g, "")
        if (!/^\d+$/.test(digits)) {
          ctx.addIssue({ code: "custom", message: "Номер может содержать только цифры" })
          return z.NEVER
        }
        if (digits.length < minDigits || digits.length > maxDigits) {
          ctx.addIssue({
            code: "custom",
            message: `Номер в международном формате: от ${minDigits} до ${maxDigits} цифр`,
          })
          return z.NEVER
        }
        if (countryCodes.length > 0 && !countryCodes.some((code) => digits.startsWith(code))) {
          ctx.addIssue({
            code: "custom",
            message: `${messenger.label} поддерживает номера с кодами ${countryCodes.map((code) => `+${code}`).join(", ")}`,
          })
          return z.NEVER
        }
        return { phoneNumber: Number(digits) }
      }),
  })
}

export type NewChatFormInput = z.input<ReturnType<typeof createNewChatSchema>>
export type NewChatFormOutput = z.output<ReturnType<typeof createNewChatSchema>>
