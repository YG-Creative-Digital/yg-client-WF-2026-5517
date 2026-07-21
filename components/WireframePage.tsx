'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface FrameMeta {
  dataFont?: string;
  dataLayout?: string;
  dataHero?: string;
  dataMood?: string;
  vars?: Record<string, string>;
}

interface WireframePageProps {
  html: string;
  meta: FrameMeta;
}

export default function WireframePage({ html, meta }: WireframePageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Intercept nav clicks (data-route) and route via Next.js.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement)?.closest('[data-route]');
      if (!target) return;
      const route = target.getAttribute('data-route');
      if (!route) return;
      e.preventDefault();
      router.push(route);
    };

    const linkables = root.querySelectorAll<HTMLElement>('[data-route]');
    linkables.forEach((el) => { el.style.cursor = 'pointer'; });
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [router, html]);

  // Scroll-reveal: the captured wireframe wraps sections in `.wf-reveal` /
  // `.wf-reveal-stagger`, which start at opacity:0 and only become visible once
  // an `.in` class is added. The intake app does this with an IntersectionObserver;
  // the static deploy needs the same, otherwise every section stays invisible.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const revealEls = root.querySelectorAll<HTMLElement>('.wf-reveal, .wf-reveal-stagger');
    if (revealEls.length === 0) return;

    // No IntersectionObserver (or reduced-motion): just show everything.
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || prefersReduced) {
      revealEls.forEach((el) => el.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    revealEls.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [html]);

  const style = (meta?.vars || {}) as React.CSSProperties;

  return (
    <div
      ref={ref}
      className="yg-page"
      data-font={meta?.dataFont || undefined}
      data-layout={meta?.dataLayout || undefined}
      data-hero={meta?.dataHero || undefined}
      data-mood={meta?.dataMood || undefined}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
