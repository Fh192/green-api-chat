import { describe, expect, it } from "vitest"

import { formatDayLabel, formatLastSeen, formatListDate } from "./format"

// Tests run with TZ=Europe/Berlin (vite.config.ts), which switches from summer
// to winter time on 25.10.2026 — that day lasts 25 hours.
describe("date labels around a DST switch", () => {
  const now = new Date(2026, 9, 26, 12, 0).getTime()
  const dayBefore = new Date(2026, 9, 25, 12, 0).getTime()
  const twoDaysBefore = new Date(2026, 9, 24, 12, 0).getTime()

  it("uses the calendar day, not 24-hour chunks", () => {
    expect(formatDayLabel(now, now)).toBe("Сегодня")
    expect(formatDayLabel(dayBefore, now)).toBe("Вчера")
    expect(formatDayLabel(twoDaysBefore, now)).toBe("24 октября")
    expect(formatLastSeen(dayBefore, now)).toMatch(/^был\(а\) вчера в/)
    expect(formatListDate(dayBefore, now)).not.toContain(":")
  })

  it("sees the setup timezone", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Berlin")
  })
})
