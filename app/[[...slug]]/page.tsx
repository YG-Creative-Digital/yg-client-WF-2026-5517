import { notFound } from 'next/navigation';
import WireframePage from '@/components/WireframePage';
import { siteData, pageKeyForSlug } from '@/lib/site-data';

// Pre-render every approved page as a static route.
export function generateStaticParams() {
  return siteData.pageOrder.map((key) =>
    key === 'home' ? { slug: [] } : { slug: key.split('/') }
  );
}

export default function Page({ params }: { params: { slug?: string[] } }) {
  const key = pageKeyForSlug(params.slug);
  if (!key) notFound();
  return <WireframePage html={siteData.pages[key]} meta={siteData.frameMeta} />;
}
