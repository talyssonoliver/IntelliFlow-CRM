import type { MetadataRoute } from 'next';
import { blogPosts } from '@/data/blog-posts';
import { jobListings } from '@/data/job-listings';
import landingPagesData from '@/data/landing-pages.json';
import pressData from '@/data/press-releases.json';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://intelliflow-crm.com';

// Update this date whenever static page content changes materially
const STATIC_LAST_MODIFIED = '2026-04-12';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/features`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/careers`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/login`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/partners`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/press`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/security`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/cookies`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/status`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: 'hourly',
      priority: 0.4,
    },
  ];

  // Blog post detail pages — timestamps from data module
  const blogRoutes: MetadataRoute.Sitemap = Object.values(blogPosts).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updatedAt ?? post.publishedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Career listing detail pages — timestamps from data module
  const careersRoutes: MetadataRoute.Sitemap = Object.values(jobListings).map((job) => ({
    url: `${BASE_URL}/careers/${job.id}`,
    lastModified: job.postedAt,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  // Landing pages — timestamps from JSON data
  const lpRoutes: MetadataRoute.Sitemap = Object.keys(landingPagesData.pages).map((slug) => ({
    url: `${BASE_URL}/lp/${slug}`,
    lastModified: landingPagesData.metadata.lastUpdated,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Press release detail pages — timestamps from JSON data
  const pressRoutes: MetadataRoute.Sitemap = pressData.releases.map((release) => ({
    url: `${BASE_URL}/press/${release.id}`,
    lastModified: release.date,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...blogRoutes, ...careersRoutes, ...lpRoutes, ...pressRoutes];
}
