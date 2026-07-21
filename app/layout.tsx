import type { Metadata } from 'next';
import './globals.css';
import { siteData } from '@/lib/site-data';

export const metadata: Metadata = {
  title: 'Site title',
  description: 'Site description',
};

function prepareCSS(css: string): string {
  return css
    // Remap intake container selectors to the deployed wrapper class
    .replace(/\.wf-frame\b/g, '.yg-page')
    .replace(/#wfFrame\b/g, '.yg-page')
    .replace(/#wfBody\b/g, '.yg-page')
    // Strip dark-mode reset that blanks the site for dark-mode visitors
    .replace(/@media[^{]*prefers-color-scheme\s*:\s*dark\s*\{[\s\S]*?\}\s*\}/g, '');
}

// The intake CSS sets .wf-section { opacity:0 } as a scroll-reveal start state.
// The intake JS (which adds .in-view to reveal sections) does not exist on the
// static deploy, so every section stays invisible. Force them visible here.
const FORCE_VISIBLE =
  '.yg-page{overflow:visible!important}' +
  '.yg-page .wf-section{opacity:1!important;transform:none!important;' +
  'animation:none!important;transition:none!important;visibility:visible!important}';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="color-scheme" content="light" />
        {(siteData.fontHrefs?.length ? siteData.fontHrefs : siteData.fontHref ? [siteData.fontHref] : []).map((h) => (
          <link key={h} rel="stylesheet" href={h} />
        ))}
        {siteData.css ? <style dangerouslySetInnerHTML={{ __html: prepareCSS(siteData.css) }} /> : null}
        <style dangerouslySetInnerHTML={{ __html: FORCE_VISIBLE }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
