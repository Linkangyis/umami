import { fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@/test/render';
import { AppBrand } from './AppBrand';

vi.mock('@/components/hooks/useConfig', () => ({
  useConfig: () => ({ branding: { appName: '星图统计', logoUrl: '/logo.png' } }),
}));

test('renders the configured app name and custom image in navigation and login layout', () => {
  const { rerender } = render(<AppBrand />);
  expect(screen.getByText('星图统计')).toBeInTheDocument();
  expect(within(screen.getByTestId('app-brand')).getByRole('img')).toHaveAttribute(
    'src',
    '/logo.png',
  );
  expect(screen.getByRole('img', { name: '星图统计 logo' })).toHaveAttribute('src', '/logo.png');
  rerender(<AppBrand vertical />);
  expect(screen.getByRole('heading', { name: '星图统计' })).toBeInTheDocument();
});

test('previews draft branding and falls back to the built-in mark when an image fails', () => {
  render(<AppBrand branding={{ appName: 'Preview Analytics', logoUrl: '/missing.png' }} />);
  fireEvent.error(screen.getByRole('img', { name: 'Preview Analytics logo' }));
  expect(screen.getByRole('img', { name: 'Preview Analytics logo' }).tagName.toLowerCase()).toBe(
    'svg',
  );
  expect(screen.getByText('Preview Analytics')).toBeInTheDocument();
});
