'use client';
import { Column, Label, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
import { useLocale } from '@/components/hooks';
import { WebsiteTrackingCode } from './WebsiteTrackingCode';

export function WebsiteEventSetup({ websiteId }: { websiteId: string }) {
  const { locale } = useLocale();
  const chinese = locale.startsWith('zh');
  const [name, setName] = useState('contact-submit');
  const eventName = name.trim().slice(0, 50) || 'contact-submit';
  const htmlName = eventName.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
  const jsName = JSON.stringify(eventName).replace(/</g, '\\u003c');

  return (
    <Column gap="6">
      <WebsiteTrackingCode websiteId={websiteId} />
      <Column gap="3">
        <Label>{chinese ? '自定义事件' : 'Custom events'}</Label>
        <Text color="muted">
          {chinese
            ? '自动采集可立即覆盖常见操作。需要区分咨询、购买等业务目标时，为按钮或表单添加事件名称；已有手工埋点不会重复记成自动事件。'
            : 'Automatic capture covers common actions. Name buttons or forms to distinguish business goals such as enquiries and purchases. Named events replace automatic events.'}
        </Text>
        <TextField
          label={chinese ? '事件名称' : 'Event name'}
          value={name}
          onChange={setName}
          maxLength={50}
        />
        <TextField
          label={chinese ? '按钮埋点示例' : 'Button tracking example'}
          value={`<button data-umami-event="${htmlName}">${chinese ? '提交' : 'Submit'}</button>`}
          isReadOnly
          allowCopy
          asTextArea
          className="code-textarea"
        />
        <TextField
          label={chinese ? '表单埋点示例' : 'Form tracking example'}
          value={`<form data-umami-event="${htmlName}">...</form>`}
          isReadOnly
          allowCopy
          asTextArea
          className="code-textarea"
        />
        <TextField
          label={chinese ? '代码埋点示例' : 'JavaScript tracking example'}
          value={`window.umami?.track(${jsName}, { source: "website" });`}
          isReadOnly
          allowCopy
          asTextArea
          className="code-textarea"
        />
        <Text color="muted" size="sm">
          {chinese
            ? '部署统计脚本后，在真实网站点击或提交，再到“活动”核对事件名称、页面地址和属性。表单提交表示提交动作，成功转化应在业务成功后调用代码事件。'
            : 'After deploying the tracker, click or submit on your website and check Activity for the event, page, and properties. A form event records the submission action; track successful conversions after your application confirms success.'}
        </Text>
      </Column>
    </Column>
  );
}
