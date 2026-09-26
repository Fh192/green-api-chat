const LOCALE = "ru-RU"

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" })
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short" })
const shortDateFormat = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "2-digit", year: "2-digit" })
const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long" })
const fullDateFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" })

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Calendar days from `timestamp` to `now`. Rounded because a day with a DST switch
 * lasts 23 or 25 hours, so the raw difference is fractional.
 */
function daysAgo(timestamp: number, now: number) {
  return Math.round((startOfDay(new Date(now)) - startOfDay(new Date(timestamp))) / DAY_MS)
}

export function isSameDay(a: number, b: number) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b))
}

export function formatTime(timestamp: number) {
  return timeFormat.format(timestamp)
}

/** Chat list: time today, weekday within a week, date otherwise — like Telegram. */
export function formatListDate(timestamp: number, now = Date.now()) {
  const days = daysAgo(timestamp, now)
  if (days <= 0) return formatTime(timestamp)
  if (days < 7) return weekdayFormat.format(timestamp)
  return shortDateFormat.format(timestamp)
}

/** Date separator in the message list. */
export function formatDayLabel(timestamp: number, now = Date.now()) {
  const days = daysAgo(timestamp, now)
  if (days === 0) return "Сегодня"
  if (days === 1) return "Вчера"
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear()
  return (sameYear ? dayMonthFormat : fullDateFormat).format(timestamp)
}

export function formatLastSeen(timestamp: number, now = Date.now()) {
  const minutes = Math.floor((now - timestamp) / 60_000)
  if (minutes < 1) return "был(а) только что"
  if (minutes < 60) return `был(а) ${minutes} мин. назад`
  const days = daysAgo(timestamp, now)
  if (days === 0) return `был(а) сегодня в ${formatTime(timestamp)}`
  if (days === 1) return `был(а) вчера в ${formatTime(timestamp)}`
  return `был(а) ${formatDayLabel(timestamp, now)}`
}

export function formatPhone(phone: number | string) {
  return `+${String(phone).replace(/\D/g, "")}`
}

export function initials(name: string) {
  const letters = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
  return (letters || name.trim()[0] || "?").toUpperCase()
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-pink-500",
]

/** Stable color per chat, like Telegram's placeholder avatars. */
export function avatarColor(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
