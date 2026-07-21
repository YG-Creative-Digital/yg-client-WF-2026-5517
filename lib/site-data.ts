import data from '@/site-data.json';

export interface NavItem {
  key: string;
  label: string;
  route: string;
}

export interface SiteData {
  ref?: string;
  pages: Record<string, string>;
  nav: NavItem[];
  pageOrder: string[];
  frameMeta: {
    dataFont?: string;
    dataLayout?: string;
    dataHero?: string;
    dataMood?: string;
    vars?: Record<string, string>;
  };
  fontHref: string;
  fontHrefs?: string[];
  css: string;
}

export const siteData = data as unknown as SiteData;

// Map a route slug array to a page key. No slug → 'home'.
export function pageKeyForSlug(slug?: string[]): string | null {
  const key = !slug || slug.length === 0 ? 'home' : slug.join('/');
  return key in siteData.pages ? key : null;
}
