import { Column, Label, Switch, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
import { useConfig, useLocale, useMessages } from '@/components/hooks';

const SCRIPT_NAME = 'script.js';

export function WebsiteTrackingCode({
  websiteId,
  hostUrl,
  showHeader = true,
}: {
  websiteId: string;
  hostUrl?: string;
  showHeader?: boolean;
}) {
  const { t, messages, labels } = useMessages();
  const config = useConfig();
  const { locale } = useLocale();
  const chinese = locale.startsWith('zh');
  const [autoEvents, setAutoEvents] = useState(true);

  const trackerScriptName =
    config?.trackerScriptName?.split(',')?.map((n: string) => n.trim())?.[0] || SCRIPT_NAME;

  const getUrl = (scriptName: string) => {
    if (config?.cloudMode) {
      return `${process.env.cloudUrl}/${scriptName}`;
    }

    return `${hostUrl || window?.location?.origin || ''}${
      process.env.basePath || ''
    }/${scriptName}`;
  };

  const url = trackerScriptName?.startsWith('http') ? trackerScriptName : getUrl(trackerScriptName);

  const code = `<script defer src="${url}" data-website-id="${websiteId}" data-auto-events="${autoEvents}"></script>`;

  return (
    <Column gap>
      {showHeader && <Label>{t(labels.trackingCode)}</Label>}
      <Text color="muted">{t(messages.trackingCode)}</Text>
      <Switch isSelected={autoEvents} onChange={setAutoEvents}>
        {chinese
          ? '自动统计按钮、链接、下载和表单提交'
          : 'Automatically track buttons, links, downloads, and form submissions'}
      </Switch>
      <Text color="muted" size="sm">
        {chinese
          ? '复制下方代码并替换网站上的统计代码后生效。自动事件不包含输入框内容；使用 data-umami-ignore 可排除某个区域。'
          : 'Copy this code to your website to apply these options. Automatic events exclude field values; add data-umami-ignore to exclude a region.'}
      </Text>
      <TextField
        value={code}
        isReadOnly
        allowCopy
        asTextArea
        resize="none"
        className="code-textarea"
      />
    </Column>
  );
}
