'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AssistantProvider } from '@/lib/assistant';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            // Don't hammer the API for errors that won't fix themselves.
            retry: (count, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
              count < 2,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AssistantProvider>
          <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
          <Toaster richColors closeButton position="bottom-center" />
        </AssistantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
