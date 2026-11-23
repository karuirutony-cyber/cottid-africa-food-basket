import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/figtree/index.css';
import './styles.css';
import { initI18n } from '@/lib/i18n';
import { registerPwa } from '@/lib/pwa';
import { AuthProvider } from '@/lib/auth';
import { createRouter } from '@/router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count) => navigator.onLine && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={createRouter()} future={{ v7_startTransition: true }} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
});

registerPwa();
