import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { BlogPost } from '../../../lib/blog';
import BlogPostClient from './BlogPostClient';

type Props = {
  params: Promise<{ slug: string }>;
};

async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  try {
    const q = query(collection(db, 'blog_posts'), where('slug', '==', slug));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const docSnap = snap.docs[0];
      const data = docSnap.data();
      if (data.published === false) return null;
      return {
        id: docSnap.id,
        title: data.title || '',
        slug: data.slug || docSnap.id,
        category: data.category || 'Novedades',
        excerpt: data.excerpt || '',
        content: data.content || '',
        coverImage: data.coverImage || '',
        author: data.author || 'Redacción DATACAR',
        published: true,
        publishedAt: data.publishedAt || '',
        readTimeMinutes: Number(data.readTimeMinutes) || 4,
        relatedModelIds: data.relatedModelIds || [],
      };
    }
  } catch (err) {
    console.warn('Error leyendo post de Firestore:', err);
  }

  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Artículo no encontrado | DATACAR',
      description: 'El artículo solicitado no existe o fue movido.',
    };
  }

  const title = `${post.title} | Blog DATACAR Paraguay`;
  const description = post.excerpt;
  const canonicalUrl = `https://datacarpy.com/blog/${slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'article',
      publishedTime: post.publishedAt,
      authors: [post.author],
      images: post.coverImage ? [{ url: post.coverImage, alt: post.title }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: post.coverImage ? [post.coverImage] : [],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.coverImage || undefined,
    datePublished: post.publishedAt || new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: post.author || 'DATACAR Paraguay',
      url: 'https://datacarpy.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'DATACAR Paraguay',
      url: 'https://datacarpy.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://datacarpy.com/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://datacarpy.com/blog/${slug}`,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <BlogPostClient post={post} />
    </>
  );
}
