import { useMemo, useState } from 'react';
import type { Article, MorningTileKnapp, KnappSignal } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { getArticleTeaser, smartTruncate } from '../utils/textUtils';

interface Props {
  data: MorningTileKnapp;
  onArticleClick: (article: Article) => void;
  isRead?: (link: string, title?: string) => boolean;
}

function LeadImage({ src, alt }: { src: string | undefined; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="lead-story-img" src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="lead-story-img lead-story-placeholder" style={{ background: getCategoryGradient('knapp') }}>
      <span className="lead-placeholder-icon">{getCategoryIcon('knapp')}</span>
    </div>
  );
}

function SecondaryThumb({ src, alt }: { src: string | undefined; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="secondary-story-thumb" src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="secondary-story-thumb-placeholder" style={{ background: getCategoryGradient('knapp') }}>
      <span>{getCategoryIcon('knapp')}</span>
    </div>
  );
}

function normalizeText(text: string | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function ensureSentence(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) return '';
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function buildKnappContext(text: string): string {
  const normalized = text.toLowerCase();
  if (/(e-commerce|warehouse|lager|fulfillment)/.test(normalized)) {
    return 'Mehr Onlinehandel erhoeht den Druck auf Lager, schneller zu kommissionieren und Ablaeufe staerker zu automatisieren.';
  }
  if (/(ai|computer-vision|computer vision|robotics|picking)/.test(normalized)) {
    return 'Besonders relevant ist die Verbindung aus Software, Computer Vision und Robotik, weil sie Picking-Prozesse praeziser, schneller und skalierbarer macht.';
  }
  if (/(lieferfahrzeuge|last-mile|autonom)/.test(normalized)) {
    return 'Fuer die Logistik ist vor allem die letzte Meile spannend: Neue Fahrzeugkonzepte und mehr Autonomie koennen Zustellkosten und Prozessketten deutlich veraendern.';
  }
  return 'Fuer KNAPP und das Intralogistik-Umfeld ist das relevant, weil Investitionen in Automatisierung, Software und Materialfluss-Technik meist frueh in solchen Signalen sichtbar werden.';
}

function buildKnappArticleBody(parsed: { title: string; summary: string }, source: string): string {
  const leadSentence = ensureSentence(parsed.summary || parsed.title);
  const contextSentence = buildKnappContext(`${parsed.title} ${parsed.summary}`);
  const sourceSentence = source
    ? `${source} zeigt damit einen Trend, der 2026 fuer Intralogistik, Warehouse-Projekte und Logistiksoftware weiter an Bedeutung gewinnen duerfte.`
    : 'Das ist ein weiterer Hinweis darauf, dass sich der Markt fuer Intralogistik und Warehouse-Projekte 2026 dynamisch entwickelt.';
  return [leadSentence, contextSentence, sourceSentence].filter(Boolean).join(' ');
}

function buildKnappLeadBody(headline: string, articles: Article[]): string {
  const parts = articles
    .slice(0, 3)
    .map((article) => ensureSentence(article.dek || article.description || article.title))
    .filter(Boolean);
  const intro = headline
    ? `${headline} verdichtet heute mehrere Signale aus Lagerautomation, Last-Mile-Logistik und Software.`
    : 'KNAPP & Intralogistik verdichtet heute mehrere Signale aus Lagerautomation, Last-Mile-Logistik und Software.';
  const closing = 'Zusammen ergibt sich ein Bild von einem Markt, in dem Automatisierung, Robotik und datengetriebene Prozesse weiter an Zugkraft gewinnen.';
  return [intro, ...parts, closing].filter(Boolean).join(' ');
}

function splitSignal(signal: KnappSignal): { title: string; summary: string } {
  const explicitTitle = normalizeText(signal.title);
  const explicitSummary = normalizeText(signal.summary);
  if (explicitTitle || explicitSummary) {
    return {
      title: explicitTitle || explicitSummary || 'KNAPP-Update',
      summary: explicitSummary || explicitTitle,
    };
  }

  const text = normalizeText(signal.text);
  const separators = [' — ', ' – ', ': ', ' - '];
  for (const separator of separators) {
    if (text.includes(separator)) {
      const [left, ...rest] = text.split(separator);
      const title = normalizeText(left);
      const summary = normalizeText(rest.join(separator));
      if (title && summary) {
        return { title, summary };
      }
    }
  }

  if (text.length <= 88) {
    return { title: text, summary: text };
  }

  const cutoff = text.lastIndexOf(' ', 84);
  if (cutoff > 30) {
    return {
      title: `${text.slice(0, cutoff).trimEnd()} …`,
      summary: text,
    };
  }

  return { title: smartTruncate(text, 84), summary: text };
}

function buildKnappArticle(signal: KnappSignal, index: number): Article {
  const parsed = splitSignal(signal);
  const link = signal.url || `#knapp-${index}`;
  const source = normalizeText(signal.source) || 'KNAPP Radar';
  const teaser = ensureSentence(parsed.summary || parsed.title);
  const body = buildKnappArticleBody(parsed, source);
  return {
    title: parsed.title || `KNAPP Signal ${index + 1}`,
    headline: parsed.title || `KNAPP Signal ${index + 1}`,
    link,
    canonical_url: signal.url || link,
    description: teaser,
    dek: teaser,
    briefing_blurb: teaser,
    summary: body,
    full_text: body,
    date: new Date().toISOString(),
    source,
    image: signal.image,
  };
}

export function KnappSection({ data, onArticleClick, isRead }: Props) {
  const signals = data.signals || [];

  const leadAndSecondary = useMemo(() => {
    const signalArticles = signals.slice(0, 4).map((signal, index) => buildKnappArticle(signal, index));
    const leadSummarySource = signalArticles
      .slice(0, 3)
      .map((article) => article.dek || article.description || article.title)
      .filter(Boolean)
      .join(' ');
    const leadHeadline = normalizeText(data.headline) || signalArticles[0]?.title || 'KNAPP-Umfeld heute';
    const leadBody = buildKnappLeadBody(leadHeadline, signalArticles);
    const lead: Article = {
      title: leadHeadline,
      headline: leadHeadline,
      link: signalArticles[0]?.link || '#knapp',
      canonical_url: signalArticles[0]?.canonical_url || signalArticles[0]?.link || '#knapp',
      description: smartTruncate(
        leadSummarySource || 'Heute relevante Entwicklungen zu Intralogistik, Lagerautomation und Transport.',
        320,
      ),
      dek: smartTruncate(
        leadSummarySource || 'Heute relevante Entwicklungen zu Intralogistik, Lagerautomation und Transport.',
        320,
      ),
      briefing_blurb: smartTruncate(
        leadSummarySource || 'Heute relevante Entwicklungen zu Intralogistik, Lagerautomation und Transport.',
        320,
      ),
      summary: leadBody,
      full_text: leadBody,
      date: new Date().toISOString(),
      source: signalArticles[0]?.source || 'KNAPP Radar',
      image: signalArticles[0]?.image,
    };
    return {
      lead,
      secondary: signalArticles,
    };
  }, [data.headline, signals]);

  if (!leadAndSecondary.lead.title && leadAndSecondary.secondary.length === 0) {
    return null;
  }

  return (
    <section className="category-section knapp-section">
      <div className="category-section-grid">
        <a
          href={leadAndSecondary.lead.link || '#'}
          className="lead-story"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            onArticleClick(leadAndSecondary.lead);
          }}
        >
          <div className="category-badge cat-knapp">KNAPP</div>
          {isRead && !isRead(leadAndSecondary.lead.link, leadAndSecondary.lead.title) && <span className="unread-dot" />}
          <h2 className="lead-story-title">{leadAndSecondary.lead.title}</h2>
          <p className="lead-story-excerpt">
            {getArticleTeaser(leadAndSecondary.lead)}
          </p>
          <div className="knapp-story-meta">
            <span className="knapp-story-source">{leadAndSecondary.lead.source}</span>
          </div>
          <LeadImage src={leadAndSecondary.lead.image} alt={leadAndSecondary.lead.title} />
        </a>

        <div className="secondary-stories">
          {leadAndSecondary.secondary.map((article, index) => (
            <a
              key={`${article.title}-${index}`}
              href={article.link || '#'}
              className="secondary-story"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onArticleClick(article);
              }}
            >
              <div className="category-badge cat-knapp">KNAPP</div>
              {isRead && !isRead(article.link, article.title) && <span className="unread-dot" />}
              <div className="secondary-story-inner">
                <div className="secondary-story-text">
                  <h3 className="secondary-story-title">{article.title}</h3>
                  <p className="secondary-story-excerpt">
                    {smartTruncate(getArticleTeaser(article), 180)}
                  </p>
                  <div className="knapp-story-meta">
                    <span className="knapp-story-source">{article.source}</span>
                  </div>
                </div>
                <SecondaryThumb src={article.image} alt={article.title} />
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
