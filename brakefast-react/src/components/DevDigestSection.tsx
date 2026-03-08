import { useState } from 'react';
import type { DevDigestData } from '../types';
import { isValidArticleImage, getCategoryGradient, getCategoryIcon } from '../utils/imageUtils';
import { smartTruncateHtml } from '../utils/textUtils';

interface Props {
  data: DevDigestData;
}

const ITEMS_ORDER: Array<{ key: keyof DevDigestData; icon: string; fallbackTitle: string }> = [
  { key: 'github_trending', icon: '🔥', fallbackTitle: 'Trending auf GitHub' },
  { key: 'releases', icon: '📦', fallbackTitle: 'Neue Releases' },
  { key: 'hn_top', icon: '💡', fallbackTitle: 'HN Top Story' },
  { key: 'security_advisory', icon: '🛡️', fallbackTitle: 'Security Advisory' },
];

function truncateHtml(html: string, max: number): string {
  return smartTruncateHtml(html, max);
}

function LeadImage({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="lead-story-img" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="lead-story-img lead-story-placeholder" style={{ background: getCategoryGradient('dev') }}>
      <span className="lead-placeholder-icon">{getCategoryIcon('dev')}</span>
    </div>
  );
}

function SecondaryThumb({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const valid = isValidArticleImage(src) && !failed;

  if (valid) {
    return <img className="secondary-story-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }

  return (
    <div className="secondary-story-thumb-placeholder" style={{ background: getCategoryGradient('dev') }}>
      <span>{getCategoryIcon('dev')}</span>
    </div>
  );
}

export function DevDigestSection({ data }: Props) {
  const items = ITEMS_ORDER
    .filter((def) => data[def.key])
    .map((def) => ({
      ...data[def.key]!,
      icon: def.icon,
      fallbackTitle: def.fallbackTitle,
    }));

  if (items.length === 0) return null;

  const lead = items[0];
  const secondary = items.slice(1);

  return (
    <section className="category-section" id="dev-digest">
      <div className="category-section-grid">
        {/* Lead item */}
        <div className="lead-story dev-digest-lead">
          <div className="category-badge cat-dev">Dev Digest</div>
          <h2 className="lead-story-title">{lead.title || lead.fallbackTitle}</h2>
          <p className="lead-story-excerpt" dangerouslySetInnerHTML={{ __html: lead.content }} />
          <div className="ki-modelle-meta">
            <span className="detail-tag">{lead.tag}</span>
            {lead.source && <span className="ki-modelle-source">{lead.source}</span>}
          </div>
          <LeadImage src={lead.image} />
        </div>

        {/* Secondary items */}
        <div className="secondary-stories">
          {secondary.map((item, i) => (
            <div key={i} className="secondary-story">
              <div className="category-badge cat-dev">Dev Digest</div>
              <div className="secondary-story-inner">
                <div className="secondary-story-text">
                  <h3 className="secondary-story-title">{item.icon} {item.title || item.fallbackTitle}</h3>
                  <p
                    className="secondary-story-excerpt"
                    dangerouslySetInnerHTML={{ __html: truncateHtml(item.content, 180) }}
                  />
                  <div className="ki-modelle-meta">
                    <span className="detail-tag">{item.tag}</span>
                    {item.source && <span className="ki-modelle-source">{item.source}</span>}
                  </div>
                </div>
                <SecondaryThumb src={item.image} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
