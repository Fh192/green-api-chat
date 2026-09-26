import { screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { mockGreenApi, server } from "@/test/msw"
import { findChatItem } from "@/test/queries"
import { logIn, renderApp } from "@/test/render"

import { sleep as pollerSleep } from "./use-notification-poller"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("notification polling", () => {
  beforeEach(() => {
    const api = mockGreenApi()
    api.addContact({ chatId: "10000000", name: "Иван", phoneNumber: 79991234567 })
    logIn()
  })

  it("does not hammer the server when it answers empty right away", async () => {
    let calls = 0
    server.use(
      http.get(/receiveNotification/, () => {
        calls += 1
        return new HttpResponse(null, { status: 200 })
      }),
    )

    renderApp()
    await findChatItem("10000000")
    await sleep(1500)

    // A tight loop would make hundreds of calls here.
    expect(calls).toBeGreaterThan(0)
    expect(calls).toBeLessThanOrEqual(3)
  })

  it("treats a 408 long-poll timeout as an empty answer, not as a network error", async () => {
    let calls = 0
    server.use(
      http.get(/receiveNotification/, async () => {
        calls += 1
        await sleep(1100) // slower than MIN_EMPTY_POLL_MS, like a real timeout
        return HttpResponse.json({ message: "Request Timeout" }, { status: 408 })
      }),
    )

    renderApp()
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2), { timeout: 4000 })

    expect(screen.getByTestId("sidebar-title")).toHaveTextContent("Чаты Telegram")
  })
})

describe("sleep", () => {
  it("removes its abort listener when the timer fires", async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, "removeEventListener")

    await pollerSleep(1, controller.signal)

    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function))
  })
})
