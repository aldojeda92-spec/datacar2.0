export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  published: boolean;
  publishedAt?: string;
  readTimeMinutes?: number;
  relatedModelIds?: string[];
}
