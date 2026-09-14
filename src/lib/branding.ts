import { z } from 'zod';

export interface AppBranding {
  appName: string;
  logoUrl: string;
}

export const DEFAULT_BRANDING: AppBranding = { appName: 'umami', logoUrl: '' };
export const MAX_BRAND_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_LENGTH = Math.ceil(MAX_BRAND_LOGO_BYTES / 3) * 4 + 64;
export const BRAND_LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function isBrandLogo(value: string) {
  if (!value) return true;
  if (value.startsWith('data:')) {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    let bytes: string;
    try {
      bytes = atob(match[2]);
    } catch {
      return false;
    }
    if (!bytes.length || bytes.length > MAX_BRAND_LOGO_BYTES) return false;
    const byte = (index: number) => bytes.charCodeAt(index);
    if (match[1] === 'png') {
      return (
        bytes.length >= 24 &&
        byte(0) === 137 &&
        bytes.slice(1, 4) === 'PNG' &&
        byte(4) === 13 &&
        byte(5) === 10 &&
        byte(6) === 26 &&
        byte(7) === 10 &&
        bytes.slice(12, 16) === 'IHDR'
      );
    }
    if (match[1] === 'jpeg') {
      return (
        bytes.length >= 4 &&
        byte(0) === 255 &&
        byte(1) === 216 &&
        byte(bytes.length - 2) === 255 &&
        byte(bytes.length - 1) === 217
      );
    }
    return bytes.length >= 20 && bytes.slice(0, 4) === 'RIFF' && bytes.slice(8, 12) === 'WEBP';
  }
  if (value.length > 2183) return false;
  try {
    const url = new URL(value, 'https://branding.invalid');
    return (
      !url.username &&
      !url.password &&
      ((value.startsWith('/') &&
        !value.startsWith('//') &&
        url.origin === 'https://branding.invalid') ||
        (value.startsWith('https://') && url.protocol === 'https:'))
    );
  } catch {
    return false;
  }
}

export const brandingSchema = z.object({
  appName: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(value =>
      Array.from(value).every(
        character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ),
  logoUrl: z
    .string()
    .trim()
    .max(MAX_LOGO_LENGTH)
    .refine(isBrandLogo, {
      message:
        'Use a PNG, JPEG or WebP image up to 2 MB, an HTTPS image URL, or a local image path.',
    })
    .default(''),
});

export function sanitizeBranding(value: unknown): AppBranding {
  const parsed = brandingSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_BRANDING };
}

export function getBrandTitle(branding: AppBranding) {
  return branding.appName === DEFAULT_BRANDING.appName ? 'Umami' : branding.appName;
}
