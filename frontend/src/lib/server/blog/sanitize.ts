// Sanitizes admin-authored article HTML before it is ever written to
// BlogArticle.contentHtml. Only admins can write this field (no public
// write path exists), but we sanitize anyway: a compromised admin
// session, a pasted snippet with tracking scripts, or a future editorial
// role should never be able to stash a stored-XSS payload that every
// public /blog/[slug] visitor then executes. Sanitized ONCE at write
// time — the stored value is trusted and rendered as-is on read.
import 'server-only';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'strong',
  'em',
  'blockquote',
  'img',
  'br',
  'code',
  'pre',
  'figure',
  'figcaption',
];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
    },
  });
}
