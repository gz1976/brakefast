import { useMemo, useState } from 'react';
import type { NewspaperData, Article } from '../types';
import { useActiveSection } from '../hooks/useActiveSection';
import { useReadTracker } from '../hooks/useReadTracker';
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
import { KnappSection } from './KnappSection';
import { TimeMachineBar } from './TimeMachineBar';
import type { ArchiveEdition } from '../types';

interface Props {
  data: NewspaperData;
  archiveEditions: ArchiveEdition[];
  selectedEdition: string | null;
  onGoToLatest: () => void;
  onGoToEdition: (edition: string) => void;
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

export function BrakeFastApp({
  data,
  archiveEditions,
  selectedEdition,
  onGoToLatest,
  onGoToEdition,
}: Props) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [calendarRevealed, setCalendarRevealed] = useState(false);
  const { markAsRead, isRead } = useReadTracker();

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
    const knappData = data.morning_tiles?.knapp;
    if (knappData?.signals?.length || knappData?.headline) s.push({ id: 'knapp', label: 'KNAPP' });
    if (worldArticles.length) s.push({ id: 'welt', label: 'Welt' });
    if (localArticles.length) s.push({ id: 'steiermark', label: 'Steiermark' });
    if (evArticles.length) s.push({ id: 'ev', label: 'E-Mobilität' });
    return s;
  }, [data, aiArticles, securityArticles, evArticles, worldArticles, localArticles]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const { activeId, scrollTo } = useActiveSection(sectionIds);

  const handleArticleClick = (article: Article) => {
    markAsRead(article.link, article.title);
    setSelectedArticle(article);
  };

  return (
    <>
      <Masthead
        date={data.generated}
        totalArticles={data.totalArticles}
        editionNumber={data.edition_number}
        readingTimeTotal={data.reading_time_total}
        onLogoClick={() => setCalendarRevealed(prev => !prev)}
      />

      <NavTabs sections={sections} activeId={activeId} onNavigate={scrollTo} />
      <TimeMachineBar
        archiveEditions={archiveEditions}
        selectedEdition={selectedEdition}
        onGoToLatest={onGoToLatest}
        onGoToEdition={onGoToEdition}
      />

      <div className="container">
        {/* First Screen: Hero + Morning Tiles fill iPad viewport */}
        <div className="first-screen">
          <HeroBriefing data={data} calendarRevealed={calendarRevealed} onToggleCalendar={() => setCalendarRevealed(prev => !prev)} onArticleClick={handleArticleClick} isRead={isRead} markAsRead={markAsRead} />
          <MorningTiles data={data} />
        </div>

        {/* 2. AI & Tech */}
        {aiArticles.length > 0 && (
          <>
            <SectionDivider label="AI & Tech" colorClass="ai" />
            <TechHub
              aiArticles={aiArticles}
              onArticleClick={handleArticleClick}
              isRead={isRead}
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
              isRead={isRead}
            />
          </>
        )}

        {/* 6. KNAPP & Intralogistik */}
        {data.morning_tiles?.knapp && (data.morning_tiles.knapp.signals?.length > 0 || data.morning_tiles.knapp.headline) && (
          <>
            <SectionDivider label="KNAPP & Intralogistik" colorClass="knapp" />
            <KnappSection data={data.morning_tiles.knapp} />
          </>
        )}

        {/* 7. Welt */}
        {worldArticles.length > 0 && (
          <>
            <SectionDivider label="Welt" colorClass="world" />
            <CategorySection
              articles={worldArticles}
              categoryId="world"
              label="Welt"
              sectionId="welt"
              onArticleClick={handleArticleClick}
              isRead={isRead}
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
              isRead={isRead}
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
              isRead={isRead}
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
