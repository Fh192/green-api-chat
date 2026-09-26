import { QueryClient } from "@tanstack/react-query"

import { GreenApiError } from "@/lib/green-api/errors"

const MAX_RETRIES = 3

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Many GREEN-API methods allow 1 request per second, so 429s are expected:
        // retry them and transient failures, but not client errors.
        retry: (failureCount, error) =>
          error instanceof GreenApiError && error.isRetryable && failureCount < MAX_RETRIES,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: { retry: false },
    },
  })
}
