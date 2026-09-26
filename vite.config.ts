/// <reference types="vitest/config" />
import { readFileSync } from "node:fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

// `vite preview` serves the same security headers (CSP etc.) as Vercel,
// so e2e tests run against the production policy.
const vercel = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "vercel.json"), "utf8")) as VercelConfig
const productionHeaders = Object.fromEntries(
  vercel.headers.find((rule) => rule.source === "/(.*)")!.headers.map(({ key, value }) => [key, value]),
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    headers: productionHeaders,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    // Fixed zone with a DST switch keeps date tests deterministic (see format.test.ts).
    env: { TZ: "Europe/Berlin" },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
})
