import { describe, expect, it } from 'vitest';
import { LEGACY_ARTICLES, parseLegacyArticle } from './blog';

const PHP = `<?php include("fonction/baseconnected.php"); ?>
<html><head>
<title>HABITAT-AFRIK - 4 REGLES D’OR</title>
<meta name="description" content="Une belle photo   fait vendre.">
</head><body>
<h1 style="font-size: 19px;">4 REGLES D’OR POUR PRENDRE UNE PHOTO D’ANNONCE REUSSIE SUR HABITAT-AFRIK</h1>
<div class="blog-photo">
  <img src="<?php echo $ulr_img ?>img/blog/article2.jpg" alt="x" class="img-fluid">
</div>
<div class="detail">
  <div>
    <p>
      Premier paragraphe. <br> <br>
      Suite du texte, voir <a href="https://tg.habitat-afrik.com/comment-avoir-son-titre-foncier-au-benin.php">cet article</a>.
    </p> <br> <br>
    <h2 style="font-size: 20px;color: #007bff;">La lumière</h2>
    <p>Texte <strong>important</strong>.<?php echo $x; ?></p>
  </div>
  <br>
  <div class="row clearfix">
    <div class="blog-social-list">Partager sur</div>
  </div>
</div>`;

describe('parseLegacyArticle', () => {
  const a = parseLegacyArticle(PHP);

  it('reads the title (sentence case when shouted), description and cover', () => {
    expect(a.title).toBe(
      '4 regles d’or pour prendre une photo d’annonce reussie sur Habitat-Afrik',
    );
    expect(a.description).toBe('Une belle photo fait vendre.');
    expect(a.coverFile).toBe('article2.jpg');
  });

  it('keeps only the article body, turning double <br> into paragraphs', () => {
    expect(a.bodyHtml).toContain('<p>');
    expect(a.bodyHtml).toContain('<h2 style="font-size: 20px;color: #007bff;">La lumière</h2>');
    expect(a.bodyHtml).not.toContain('Partager sur');
    expect(a.bodyHtml).not.toContain('<?php');
    expect(a.bodyHtml).not.toMatch(/<br>\s*<br>/);
    expect(a.bodyHtml).toMatch(/Premier paragraphe\.\s*<\/p>\s*<p>\s*Suite du texte/);
  });

  it('points links to other legacy articles at the new blog', () => {
    expect(a.bodyHtml).toContain('href="/blog/comment-avoir-son-titre-foncier-au-benin"');
  });
});

describe('LEGACY_ARTICLES', () => {
  it('lists the 12 legacy articles, each with a known category', () => {
    expect(LEGACY_ARTICLES).toHaveLength(12);
    expect(new Set(LEGACY_ARTICLES.map((a) => a.slug)).size).toBe(12);
    // Shouted legacy title gets a hand-written replacement (accents restored).
    expect(
      LEGACY_ARTICLES.find((a) => a.slug === '4-regle-dor-pour-prendre-une-photo-dannonce-reussie')
        ?.title,
    ).toBe('4 règles d’or pour prendre une photo d’annonce réussie');
  });
});
