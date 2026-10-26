'use client';

import { Component, use, useId, useSyncExternalStore, type ReactNode } from 'react';
import { useTheme } from 'next-themes';

export function Mermaid({ chart }: { chart: string }) {
  // `false` on the server and during hydration
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isClient) return;
  return (
    <MermaidErrorBoundary chart={chart}>
      <MermaidContent chart={chart} />
    </MermaidErrorBoundary>
  );
}

/**
 * 图表渲染失败（语法错误等）不能把整页炸掉：降级成等宽的源码块。
 * mermaid 的 parse/render 错误是异步抛出的（`use()` 的 rejected promise），
 * 只有 error boundary 能接住。
 */
class MermaidErrorBoundary extends Component<
  { chart: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <pre
          style={{
            overflow: 'auto',
            padding: '1rem',
            border: '1px solid rgba(200, 80, 80, 0.5)',
            borderRadius: '0.5rem',
            fontSize: '0.85rem',
          }}
        >
          {'图表渲染失败（语法错误），源码如下：\n\n'}
          {this.props.chart}
        </pre>
      );
    }
    return this.props.children;
  }
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  // React 19 的 useId 形如 `«r0»`，直喂给 mermaid.render 会在 querySelector 上翻车；
  // 清成安全的 CSS id。
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () => {
      return mermaid.render(id, chart.replaceAll('\\n', '\n'));
    }),
  );

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
