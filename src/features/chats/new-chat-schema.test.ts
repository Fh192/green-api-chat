import { describe, expect, it } from "vitest"

import { messengers } from "@/lib/green-api/messengers"

import { createNewChatSchema } from "./new-chat-schema"

function parse(messenger: keyof typeof messengers, contact: string) {
  return createNewChatSchema(messengers[messenger]).safeParse({ contact })
}

describe("createNewChatSchema", () => {
  it("accepts formatted phone numbers", () => {
    expect(parse("telegram", " +7 (999) 123-45-67 ")).toMatchObject({
      success: true,
      data: { contact: { phoneNumber: 79991234567 } },
    })
  })

  it("accepts Telegram usernames", () => {
    expect(parse("telegram", "@green_api")).toMatchObject({ success: true, data: { contact: { username: "@green_api" } } })
  })

  it("rejects usernames for messengers without username search", () => {
    const result = parse("whatsapp", "@green_api")
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toMatch(/только по номеру/)
  })

  it("rejects letters and wrong lengths", () => {
    expect(parse("telegram", "7999abc").error?.issues[0].message).toMatch(/только цифры/)
    expect(parse("telegram", "123").error?.issues[0].message).toMatch(/от 10 до 15 цифр/)
  })

  it("restricts MAX to Russian and Belarusian numbers", () => {
    expect(parse("max", "79991234567").success).toBe(true)
    expect(parse("max", "375291234567").success).toBe(true)
    expect(parse("max", "49151234567").error?.issues[0].message).toMatch(/\+7, \+375/)
  })

  it("requires a value", () => {
    expect(parse("telegram", "   ").error?.issues[0].message).toBe("Введите номер телефона или @username")
  })
})
