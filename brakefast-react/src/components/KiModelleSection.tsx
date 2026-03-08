import { useState } from 'react';
import type { KiModelleData } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { smartTruncateHtml, sanitizeHtml } from '../utils/textUtils';

interface Props {
  data: KiModelleData;
}

function truncateHtml(html: string, max: number): string {
  return smartTruncateHtml(html, max);
}

function LeadImage({ src, alt }: { src: string | undefined; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="lead-story-img" src={src} alt={alt || ''} loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="lead-story-img lead-story-placeholder" style={{ background: getCategoryGradient('ki') }}>
      <span className="lead-placeholder-icon">{getCategoryIcon('ki')}</span>
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
    <div className="secondary-story-thumb-placeholder" style={{ background: getCategoryGradient('ki') }}>
      <span>{getCategoryIcon('ki')}</span>
    </div>
  );
}

export function KiModelleSection({ data }: Props) {
  const items = [
    data.releases ? { ...data.releases, fallbackTitle: 'Neue Releases' } : null,
    data.benchmarks ? { ...data.benchmarks, fallbackTitle: 'Benchmark-Update' } : null,
    data.pricing ? { ...data.pricing, fallbackTitle: 'Pricing-Änderungen' } : null,
    data.tools ? { ...data.tools, fallbackTitle: 'Neue Tools & Features' } : null,
  ].filter(Boolean) as Array<{ title: string; content: string; tag: string; source?: string; date?: string; image?: string; link?: string; fallbackTitle: string }>;

  if (items.length === 0) return null;

  const lead = items[0];
  const secondary = items.slice(1);

  const LeadTag = lead.link ? 'a' : 'div';
  const leadProps = lead.link
    ? { href: lead.link, target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};

  return (
    <section className="category-section" id="ki-modelle">
      <div className="category-section-grid">
        {/* Lead item */}
        <LeadTag className="lead-story ki-modelle-lead" {...leadProps}>
          <div className="category-badge cat-ki">KI Modelle</div>
          <h2 className="lead-story-title">{lead.title || lead.fallbackTitle}</h2>
          <p className="lead-story-excerpt" dangerouslySetInnerHTML={{ __html: sanitizeHtml(lead.content) }} />
          <div className="ki-modelle-meta">
            <span className="detail-tag">{lead.tag}</span>
            {lead.source && <span className="ki-modelle-source">{lead.source}</span>}
          </div>
          <LeadImage src={lead.image} alt={lead.title || lead.fallbackTitle} />
        </LeadTag>

        {/* Secondary items */}
        <div className="secondary-stories">
          {secondary.map((item, i) => {
            const Tag = item.link ? 'a' : 'div';
            const tagProps = item.link
              ? { href: item.link, target: '_blank' as const, rel: 'noopener noreferrer' }
              : {};
            return (
              <Tag key={i} className="secondary-story" {...tagProps}>
                <div className="category-badge cat-ki">KI Modelle</div>
                <div className="secondary-story-inner">
                  <div className="secondary-story-text">
                    <h3 className="secondary-story-title">{item.title || item.fallbackTitle}</h3>
                    <p
                      className="secondary-story-excerpt"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(truncateHtml(item.content, 180)) }}
                    />
                    <div className="ki-modelle-meta">
                      <span className="detail-tag">{item.tag}</span>
                      {item.source && <span className="ki-modelle-source">{item.source}</span>}
                    </div>
                  </div>
                  <SecondaryThumb src={item.image} alt={item.title || item.fallbackTitle} />
                </div>
              </Tag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
