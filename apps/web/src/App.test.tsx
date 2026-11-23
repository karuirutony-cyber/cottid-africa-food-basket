import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { act } from 'react';
import { routerFuture, routes } from './router';
import i18n, { initI18n, setLanguage } from './lib/i18n';

beforeAll(async () => {
  await initI18n();
  await setLanguage('en');
});

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path], future: routerFuture });
  return render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
}

describe('app shell', () => {
  it('renders the home page with the brand, the sections and the footer', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Africa's food basket");
    const nav = screen.getAllByRole('navigation', { name: 'Platform sections' })[0]!;
    for (const label of ['Countries', 'Analytics', 'Cost of Imports', 'Directory', 'Policy and development', 'Data', 'About']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('© 2026 Cottid Africa. All rights reserved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
  });

  it('shows section sub-pages and marks the current one', () => {
    renderAt('/cost/calculator');
    const sub = screen.getByRole('navigation', { name: 'Pages in this section' });
    expect(within(sub).getByRole('link', { name: 'Calculator' })).toHaveAttribute('aria-current', 'page');
    expect(document.documentElement.dataset.section).toBe('cost');
  });

  it('shows 404 for unknown routes', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found');
  });

  it('switches to Arabic right to left', async () => {
    renderAt('/');
    await act(() => setLanguage('ar'));
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(screen.getByText('© 2026 Cottid Africa. جميع الحقوق محفوظة.')).toBeInTheDocument();
    await act(() => setLanguage('en'));
    expect(document.documentElement.dir).toBe('ltr');
    expect(i18n.language).toBe('en');
  });
});
