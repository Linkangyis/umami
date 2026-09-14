'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Column, Row, Text, TextField } from '@umami/react-zen';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppBrand } from '@/components/common/AppBrand';
import { LoadingPanel } from '@/components/common/LoadingPanel';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useApi, useConfig, useLocale } from '@/components/hooks';
import {
  type AppBranding,
  BRAND_LOGO_MIME_TYPES,
  brandingSchema,
  DEFAULT_BRANDING,
  MAX_BRAND_LOGO_BYTES,
} from '@/lib/branding';
import { setConfig } from '@/store/app';

export function BrandingPage() {
  const { locale } = useLocale();
  const cn = locale.startsWith('zh');
  const text = (zh: string, en: string) => (cn ? zh : en);
  const { get, post, del, useQuery } = useApi();
  const config = useConfig();
  const queryClient = useQueryClient();
  const router = useRouter();
  const query = useQuery<AppBranding>({
    queryKey: ['admin:branding'],
    queryFn: () => get('/admin/branding'),
  });
  const [draft, setDraft] = useState<AppBranding>(DEFAULT_BRANDING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const apply = async (value: AppBranding) => {
    setDraft(value);
    setConfig({ ...config, branding: value });
    queryClient.setQueryData(['config'], { ...config, branding: value });
    queryClient.setQueryData(['admin:branding'], value);
    await queryClient.invalidateQueries({ queryKey: ['config'], exact: true });
    router.refresh();
    setNotice(
      text(
        '品牌设置已保存，登录页和导航栏已更新。',
        'Brand saved. The login page and navigation now use your brand.',
      ),
    );
  };
  const save = async (reset = false) => {
    setError('');
    setNotice('');
    const valid = brandingSchema.safeParse(draft);
    if (!reset && !valid.success) {
      setError(
        text(
          '应用名称需为 1–80 个字符；标志需为 HTTPS 图片地址、本机相对路径，或不超过 2 MB 的 PNG、JPEG、WebP 图片。',
          'Use a 1–80 character name and an HTTPS/local logo URL or a PNG, JPEG, or WebP image up to 2 MB.',
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await apply(reset ? await del('/admin/branding') : await post('/admin/branding', valid.data));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const readLogo = async (file?: File) => {
    if (!file) return;
    setError('');
    setNotice('');
    if (!BRAND_LOGO_MIME_TYPES.includes(file.type) || file.size > MAX_BRAND_LOGO_BYTES) {
      setError(
        text(
          '请上传不超过 2 MB 的 PNG、JPEG 或 WebP 图片。',
          'Upload a PNG, JPEG, or WebP image no larger than 2 MB.',
        ),
      );
      return;
    }
    try {
      const logoUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Image could not be read.'));
        reader.readAsDataURL(file);
      });
      if (!brandingSchema.shape.logoUrl.safeParse(logoUrl).success)
        throw new Error(
          text(
            '图片格式无效，请选择有效的 PNG、JPEG 或 WebP 图片。',
            'Invalid image. Choose a valid PNG, JPEG, or WebP file.',
          ),
        );
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () =>
          reject(
            new Error(
              text(
                '无法读取图片，请选择有效的图片文件。',
                'The image could not be decoded. Choose a valid image file.',
              ),
            ),
          );
        image.src = logoUrl;
      });
      setDraft(current => ({ ...current, logoUrl }));
    } catch (error) {
      setError((error as Error).message);
    }
  };

  return (
    <Column gap="6">
      <PageHeader title={text('品牌设置', 'Brand settings')} />
      <LoadingPanel {...query} minHeight="200px">
        <Column gap="6">
          <Panel
            title={text('应用名称与标志', 'Application name and logo')}
            description={text(
              '设置所有用户看到的应用名称和标志，保存后立即生效。',
              'Set the application name and logo shown to all users. Changes take effect when saved.',
            )}
          >
            <TextField
              label={text('应用名称', 'Application name')}
              aria-label={text('应用名称', 'Application name')}
              value={draft.appName}
              maxLength={80}
              onChange={appName => setDraft(current => ({ ...current, appName }))}
            />
            <TextField
              label={text('标志图片地址', 'Logo image URL')}
              aria-label={text('标志图片地址', 'Logo image URL')}
              value={draft.logoUrl.startsWith('data:') ? '' : draft.logoUrl}
              placeholder="https://example.com/logo.png"
              onChange={logoUrl => setDraft(current => ({ ...current, logoUrl }))}
            />
            <Row alignItems="center" gap wrap="wrap">
              <input
                ref={upload}
                type="file"
                accept={BRAND_LOGO_MIME_TYPES.join(',')}
                hidden
                aria-label={text('上传标志文件', 'Upload logo file')}
                onChange={event => {
                  readLogo(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <Button onPress={() => upload.current?.click()}>
                {text('上传标志图片', 'Upload logo')}
              </Button>
              <Button
                isDisabled={!draft.logoUrl}
                onPress={() => setDraft(current => ({ ...current, logoUrl: '' }))}
              >
                {text('使用默认标志', 'Use default logo')}
              </Button>
              <Text color="muted">
                {text('PNG、JPEG、WebP；最大 2 MB。', 'PNG, JPEG, WebP; maximum 2 MB.')}
              </Text>
            </Row>
            {draft.logoUrl.startsWith('data:') && (
              <Text color="muted">
                {text(
                  '已选择上传图片，点击保存后会存储到此应用。',
                  'An uploaded image is selected. Save to store it in this application.',
                )}
              </Text>
            )}
            {error && (
              <Text role="alert" style={{ color: 'var(--color-danger, #dc2626)' }}>
                {error}
              </Text>
            )}
            {notice && <Text role="status">{notice}</Text>}
            <Row gap>
              <Button variant="primary" isDisabled={busy} onPress={() => save()}>
                {text('保存品牌设置', 'Save brand settings')}
              </Button>
              <Button isDisabled={busy} onPress={() => save(true)}>
                {text('恢复默认品牌', 'Reset to default brand')}
              </Button>
            </Row>
          </Panel>
          <Panel title={text('实时预览', 'Live preview')}>
            <Row justifyContent="space-around" alignItems="center" gap="6" wrap="wrap">
              <Column gap="3" style={{ maxWidth: 240 }}>
                <Text color="muted">{text('导航栏', 'Navigation')}</Text>
                <AppBrand branding={draft} />
              </Column>
              <Column gap="3">
                <Text color="muted">{text('登录页', 'Login page')}</Text>
                <AppBrand branding={draft} vertical />
              </Column>
            </Row>
          </Panel>
        </Column>
      </LoadingPanel>
    </Column>
  );
}
