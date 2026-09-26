// Prints nginx `add_header` directives for the security headers in vercel.json,
// so the Docker image, Vercel and `vite preview` share one source of truth.
// Usage: node docker/nginx-headers.mjs > security-headers.conf
import { readFileSync } from "node:fs"

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
const rule = vercel.headers.find((item) => item.source === "/(.*)")
if (!rule) throw new Error('vercel.json has no headers rule for "/(.*)"')

for (const { key, value } of rule.headers) {
  if (value.includes('"')) throw new Error(`Header ${key} contains a double quote`)
  // "always" also adds the headers to error responses (404 etc.).
  console.log(`add_header ${key} "${value}" always;`)
}
