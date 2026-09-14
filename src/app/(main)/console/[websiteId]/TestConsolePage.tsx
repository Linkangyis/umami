'use client';
import { Button, Column, Grid, Heading } from '@umami/react-zen';
import Script from 'next/script';
import { WebsiteChart } from '@/app/(main)/websites/[websiteId]/WebsiteChart';
import Link from '@/components/common/Link';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Panel';
import { useLocale, useWebsiteQuery } from '@/components/hooks';
import { EventsChart } from '@/components/metrics/EventsChart';

const consoleCopy = {
  en: {
    testConsole: 'Test console',
    pageLinks: 'Page links',
    pageOne: 'page one',
    pageTwo: 'page two',
    externalDirect: 'external link (direct)',
    externalTab: 'external link (tab)',
    clickEvents: 'Click events',
    sendEvent: 'Send event',
    sendWithData: 'Send event with data',
    generateRevenue: 'Generate revenue data',
    buttonDiv: 'Button with div',
    divAttribute: 'DIV with attribute',
    nestedDiv: 'Nested DIV',
    javascriptEvents: 'Javascript events',
    runScript: 'Run script',
    runIdentify: 'Run identify',
    revenueScript: 'Revenue script',
    pageviews: 'Pageviews',
    events: 'Events',
  },
  zh: {
    testConsole: '统计测试台',
    pageLinks: '页面链接',
    pageOne: '页面一',
    pageTwo: '页面二',
    externalDirect: '外部链接（当前标签页）',
    externalTab: '外部链接（新标签页）',
    clickEvents: '点击事件',
    sendEvent: '发送事件',
    sendWithData: '发送带属性的事件',
    generateRevenue: '生成收入测试数据',
    buttonDiv: '包含 DIV 的按钮',
    divAttribute: '带追踪属性的 DIV',
    nestedDiv: '嵌套 DIV',
    javascriptEvents: 'JavaScript 事件',
    runScript: '运行脚本',
    runIdentify: '测试用户识别',
    revenueScript: '测试收入脚本',
    pageviews: '浏览量',
    events: '事件',
  },
};

export function TestConsolePage({ websiteId }: { websiteId: string }) {
  const { data } = useWebsiteQuery(websiteId);
  const { locale } = useLocale();
  const copy = consoleCopy[locale.startsWith('zh') ? 'zh' : 'en'];

  function handleRunScript() {
    window.umami.track(props => ({
      ...props,
      url: '/page-view',
      referrer: 'https://www.google.com',
    }));
    window.umami.track('track-event-no-data');
    window.umami.track('track-event-with-data', {
      test: 'test-data',
      boolean: true,
      booleanError: 'true',
      time: new Date().toISOString(),
      user: `user${Math.round(Math.random() * 10)}`,
      number: 1,
      number2: Math.random() * 100,
      time2: new Date().toISOString(),
      nested: {
        test: 'test-data',
        number: 1,
        object: {
          test: 'test-data',
        },
      },
      array: [1, 2, 3],
    });
  }

  function handleRunRevenue() {
    window.umami.track(props => ({
      ...props,
      url: '/checkout-cart',
      referrer: 'https://www.google.com',
    }));
    window.umami.track('checkout-cart', {
      revenue: parseFloat((Math.random() * 1000).toFixed(2)),
      currency: 'USD',
    });
    window.umami.track('affiliate-link', {
      revenue: parseFloat((Math.random() * 1000).toFixed(2)),
      currency: 'USD',
    });
    window.umami.track('promotion-link', {
      revenue: parseFloat((Math.random() * 1000).toFixed(2)),
      currency: 'USD',
    });
    window.umami.track('checkout-cart', {
      revenue: parseFloat((Math.random() * 1000).toFixed(2)),
      currency: 'EUR',
    });
    window.umami.track('promotion-link', {
      revenue: parseFloat((Math.random() * 1000).toFixed(2)),
      currency: 'EUR',
    });
    window.umami.track('affiliate-link', {
      item1: {
        productIdentity: 'ABC424',
        revenue: parseFloat((Math.random() * 10000).toFixed(2)),
        currency: 'JPY',
      },
      item2: {
        productIdentity: 'ZYW684',
        revenue: parseFloat((Math.random() * 10000).toFixed(2)),
        currency: 'JPY',
      },
    });
  }

  function handleRunIdentify() {
    window.umami.identify({
      userId: 123,
      name: 'brian',
      number: Math.random() * 100,
      test: 'test-data',
      boolean: true,
      booleanError: 'true',
      time: new Date().toISOString(),
      time2: new Date().toISOString(),
      nested: {
        test: 'test-data',
        number: 1,
        object: {
          test: 'test-data',
        },
      },
      array: [1, 2, 3],
    });
  }

  if (!data) {
    return null;
  }

  return (
    <PageBody>
      <PageHeader title={copy.testConsole}>
        <Column>{data.name}</Column>
      </PageHeader>
      <Column gap="6" paddingY="6">
        <Script
          async
          data-website-id={websiteId}
          src={`${process.env.basePath || ''}/script.js`}
          data-cache="true"
          data-performance="true"
        />
        <Script
          async
          data-website-id={websiteId}
          src={`${process.env.basePath || ''}/recorder.js`}
        />
        <Panel>
          <Grid columns="1fr 1fr 1fr" gap>
            <Column gap>
              <Heading>{copy.pageLinks}</Heading>
              <div>
                <Link href={`/console/${websiteId}?page=1`}>{copy.pageOne}</Link>
              </div>
              <div>
                <Link href={`/console/${websiteId}?page=2 `}>{copy.pageTwo}</Link>
              </div>
              <div>
                <a href="https://www.google.com" data-umami-event="external-link-direct">
                  {copy.externalDirect}
                </a>
              </div>
              <div>
                <a
                  href="https://www.google.com"
                  data-umami-event="external-link-tab"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.externalTab}
                </a>
              </div>
            </Column>
            <Column gap>
              <Heading>{copy.clickEvents}</Heading>
              <Button id="send-event-button" data-umami-event="button-click" variant="primary">
                {copy.sendEvent}
              </Button>
              <Button
                id="send-event-data-button"
                data-umami-event="button-click"
                data-umami-event-name="bob"
                data-umami-event-id="123"
                variant="primary"
              >
                {copy.sendWithData}
              </Button>
              <Button
                id="generate-revenue-button"
                data-umami-event="checkout-cart"
                data-umami-event-revenue={(Math.random() * 10000).toFixed(2).toString()}
                data-umami-event-currency="USD"
                variant="primary"
              >
                {copy.generateRevenue}
              </Button>
              <Button
                id="button-with-div-button"
                data-umami-event="button-click"
                data-umami-event-name={'bob'}
                data-umami-event-id="123"
                variant="primary"
              >
                <div>{copy.buttonDiv}</div>
              </Button>
              <div data-umami-event="div-click">{copy.divAttribute}</div>
              <div data-umami-event="div-click-one">
                <div data-umami-event="div-click-two">
                  <div data-umami-event="div-click-three">{copy.nestedDiv}</div>
                </div>
              </div>
            </Column>
            <Column gap>
              <Heading>{copy.javascriptEvents}</Heading>
              <Button id="manual-button" variant="primary" onClick={handleRunScript}>
                {copy.runScript}
              </Button>
              <Button id="manual-button" variant="primary" onClick={handleRunIdentify}>
                {copy.runIdentify}
              </Button>
              <Button id="manual-button" variant="primary" onClick={handleRunRevenue}>
                {copy.revenueScript}
              </Button>
            </Column>
          </Grid>
        </Panel>
        <Heading>{copy.pageviews}</Heading>
        <WebsiteChart websiteId={websiteId} />
        <Heading>{copy.events}</Heading>
        <Panel>
          <EventsChart websiteId={websiteId} />
        </Panel>
      </Column>
    </PageBody>
  );
}
