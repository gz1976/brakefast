import { useMemo, useState } from 'react';
import type { NewspaperData, Article } from '../types';
import { useActiveSection } from '../hooks/useActiveSection';
import { Masthead } from './Masthead';
import { NavTabs } from './NavTabs';
import { HeroBriefing } from './HeroBriefing';
import { TechHub } from './TechHub';
import { CategorySection } from './CategorySection';
import { KiModelleSection } from './KiModelleSection';
import { DevDigestSection } from './DevDigestSection';
import { Footer } from './Footer';
import { ArticleModal } from './ArticleModal';
import { MorningTiles } from './MorningTiles';

interface Props {
  data: NewspaperData;
}

interface NavSection {
  id: string;
  label: string;
}

function SectionDivider({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <div className={`section-divider section-divider-${colorClass}`}>
      <div className="section-divider-line" />
      <span className="section-divider-label">{label}</span>
      <div className="section-divider-line" />
    </div>
  );
}

export function BrakeFastApp({ data }: Props) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const securityArticles = data.categories.security?.articles || [];
  const aiArticles = data.categories.ai?.articles || [];
  const evArticles = data.categories.ev?.articles || [];
  const worldArticles = data.categories.world?.articles || [];
  const localArticles = data.categories.local?.articles || [];

  // Nav sections — order matches page render order
  const sections = useMemo<NavSection[]>(() => {
    const s: NavSection[] = [{ id: 'top-stories', label: 'Titelseite' }];

    if (aiArticles.length) s.push({ id: 'ai-tech', label: 'AI & Tech' });
    if (data.dev_digest && Object.keys(data.dev_digest).length > 0) s.push({ id: 'dev-digest', label: 'Dev Digest' });
    if (data.ki_modelle) s.push({ id: 'ki-modelle', label: 'KI Modelle' });
    if (securityArticles.length) s.push({ id: 'security', label: 'Security' });
    if (worldArticles.length) s.push({ id: 'welt', label: 'Welt' });
    if (localArticles.length) s.push({ id: 'steiermark', label: 'Steiermark' });
    if (evArticles.length) s.push({ id: 'ev', label: 'E-Mobilität' });
    return s;
  }, [data, aiArticles, securityArticles, evArticles, worldArticles, localArticles]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const { activeId, scrollTo } = useActiveSection(sectionIds);

  const handleArticleClick = (article: Article) => {
    setSelectedArticle(article);
  };

  return (
    <>
      <Masthead
        date={data.generated}
        totalArticles={data.totalArticles}
        editionNumber={data.edition_number}
        readingTimeTotal={data.reading_time_total}
      />

      <NavTabs sections={sections} activeId={activeId} onNavigate={scrollTo} />

      <div className="container">
        {/* First Screen: Hero + Morning Tiles fill iPad viewport */}
        <div className="first-screen">
          <HeroBriefing data={data} />
          <MorningTiles data={data} />
        </div>

        {/* 2. AI & Tech */}
        {aiArticles.length > 0 && (
          <>
            <SectionDivider label="AI & Tech" colorClass="ai" />
            <TechHub
              aiArticles={aiArticles}
              onArticleClick={handleArticleClick}
            />
          </>
        )}

        {/* 3. Dev Digest (eigene Sektion) */}
        {data.dev_digest && Object.keys(data.dev_digest).length > 0 && (
          <>
            <SectionDivider label="Dev Digest" colorClass="dev" />
            <DevDigestSection data={data.dev_digest} />
          </>
        )}

        {/* 4. KI Modelle */}
        {data.ki_modelle && (
          <>
            <SectionDivider label="KI Modelle" colorClass="ki" />
            <KiModelleSection data={data.ki_modelle} />
          </>
        )}

        {/* 5. Security */}
        {securityArticles.length > 0 && (
          <>
            <SectionDivider label="Security" colorClass="security" />
            <CategorySection
              articles={securityArticles}
              categoryId="security"
              label="Security"
              sectionId="security"
              onArticleClick={handleArticleClick}
            />
          </>
        )}

        {/* 6. Welt */}
        {worldArticles.length > 0 && (
          <>
            <SectionDivider label="Welt" colorClass="world" />
            <CategorySection
              articles={worldArticles}
              categoryId="world"
              label="Welt"
              sectionId="welt"
              onArticleClick={handleArticleClick}
            />
          </>
        )}

        {/* 7. Steiermark */}
        {localArticles.length > 0 && (
          <>
            <SectionDivider label="Steiermark" colorClass="local" />
            <CategorySection
              articles={localArticles}
              categoryId="local"
              label="Steiermark"
              sectionId="steiermark"
              onArticleClick={handleArticleClick}
            />
          </>
        )}

        {/* 8. E-Mobilität */}
        {evArticles.length > 0 && (
          <>
            <SectionDivider label="E-Mobilität" colorClass="ev" />
            <CategorySection
              articles={evArticles}
              categoryId="ev"
              label="E-Mobilität"
              sectionId="ev"
              onArticleClick={handleArticleClick}
            />
          </>
        )}

      </div>

      <Footer generated={data.generated} editionNumber={data.edition_number} />

      {selectedArticle && (
        <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </>
  );
}
