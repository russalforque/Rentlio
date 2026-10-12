import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Permission and validation errors will not fix themselves.
        const code = (error as { code?: string }).code
        if (code && /^(42501|22023|P0002|PGRST)/.test(code)) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})
