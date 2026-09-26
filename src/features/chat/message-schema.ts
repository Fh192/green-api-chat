import { z } from "zod"

export function createMessageSchema(maxLength: number) {
  return z.object({
    text: z
      .string()
      .trim()
      .min(1, "Введите сообщение")
      .max(maxLength, `Сообщение длиннее ${maxLength} символов`),
  })
}

export type MessageFormValues = z.infer<ReturnType<typeof createMessageSchema>>
