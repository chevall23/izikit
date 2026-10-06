import { describe, expect, it } from 'vitest';
import { articleJsonLd, articleSeoDescription } from './blog';

const article = {
  title: 'Comment avoir son titre foncier au Bénin',
  excerpt: '',
  contentHtml:
    '<p>Le titre foncier est <strong>le seul document</strong> qui garantit la propriété.</p>',
  coverImageUrl: 'https://cdn.example/cover.webp',
  author: { name: 'Équipe Habitat-Afrik' },
  category: { label: 'Conseils' },
  tags: ['titre foncier', 'Bénin'],
  publishedAt: '2023-05-10T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

describe('articleSeoDescription', () => {
  it('uses the excerpt, or the text of the article when there is none', () => {
    expect(articleSeoDescription({ ...article, excerpt: 'Résumé court.' })).toBe('Résumé court.');
    expect(articleSeoDescription(article)).toBe(
      'Le titre foncier est le seul document qui garantit la propriété.',
    );
  });
});

describe('articleJsonLd', () => {
  it('is a BlogPosting published by the organisation', () => {
    const ld = articleJsonLd(
      article,
      'https://habitat-afrik.com/blog/titre-foncier',
      'https://habitat-afrik.com',
    );
    expect(ld).toMatchObject({
      '@type': 'BlogPosting',
      headline: article.title,
      image: [article.coverImageUrl],
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      author: { '@type': 'Organization', name: 'Équipe Habitat-Afrik' },
      publisher: { '@id': 'https://habitat-afrik.com/#organization' },
      mainEntityOfPage: 'https://habitat-afrik.com/blog/titre-foncier',
      articleSection: 'Conseils',
      keywords: 'titre foncier, Bénin',
    });
  });
});

describe('articleJsonLd author', () => {
  it('describes a named writer as a Person with their role', () => {
    const ld = articleJsonLd(
      { ...article, author: { name: 'Fatou Diarra', role: 'Conseillère', avatarUrl: null } },
      'https://habitat-afrik.com/blog/x',
      'https://habitat-afrik.com',
    );
    expect(ld.author).toEqual({ '@type': 'Person', name: 'Fatou Diarra', jobTitle: 'Conseillère' });
  });
});
