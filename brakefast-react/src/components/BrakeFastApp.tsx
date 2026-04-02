import { useCallback, useMemo, useState } from 'react';
import type { NewspaperData, Article } from '../types';
import { useActiveSection } from '../hooks/useActiveSection';
import { useReadTracker } from '../hooks/useReadTracker';
import { Masthead } from './Masthead';
import { NavTabs } from './NavTabs';
import { HeroBriefing } from './HeroBriefing';
import { TechHub } from './TechHub';
import { CategorySection } from './CategorySection';
import { Footer } from './Footer';
import { ArticleModal } from './ArticleModal';
import { Toast } from './Toast';
import { MorningTiles } from './MorningTiles';
import { TimeMachineBar } from './TimeMachineBar';
import { ErrorBoundary } from './ErrorBoundary';
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
  const [selectedArticle, setSelectedArticle] = useState<{ article: Article; categoryId: string } | null>(null);
  const [calendarRevealed, setCalendarRevealed] = useState(true);
  const { markAsRead, isRead, clearAll, readCount } = useReadTracker();
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const handleToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
  }, []);

  const categoryArrays = useMemo(() => ({
    security: data.categories.security?.articles || [],
    ai: data.categories.ai?.articles || [],
    knapp: data.categories.knapp?.articles || [],
    devDigest: data.categories.dev_digest?.articles || [],
    kiModelle: data.categories.ki_modelle?.articles || [],
    ev: data.categories.ev?.articles || [],
    world: data.categories.world?.articles || [],
    local: data.categories.local?.articles || [],
  }), [data]);

  // Nav sections — order matches page render order
  const sections = useMemo<NavSection[]>(() => {
    const s: NavSection[] = [{ id: 'top-stories', label: 'Titelseite' }];

    if (categoryArrays.ai.length) s.push({ id: 'ai-tech', label: 'AI & Tech' });
    if (categoryArrays.knapp.length) s.push({ id: 'knapp', label: 'KNAPP' });
    if (categoryArrays.devDigest.length) s.push({ id: 'dev-digest', label: 'Dev Digest' });
    if (categoryArrays.kiModelle.length) s.push({ id: 'ki-modelle', label: 'KI Modelle' });
    if (categoryArrays.security.length) s.push({ id: 'security', label: 'Security' });
    if (categoryArrays.world.length) s.push({ id: 'welt', label: 'Welt' });
    if (categoryArrays.local.length) s.push({ id: 'steiermark', label: 'Steiermark' });
    if (categoryArrays.ev.length) s.push({ id: 'ev', label: 'E-Mobilität' });
    return s;
  }, [categoryArrays]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const { activeId, scrollTo } = useActiveSection(sectionIds);

  const handleArticleClick = (article: Article, categoryId?: string) => {
    markAsRead(article.link, article.title);
    setSelectedArticle({ article, categoryId: categoryId || 'default' });
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

      <div className="container" id="main-content">
        {/* First Screen: Hero + Morning Tiles fill iPad viewport */}
        <div className="first-screen">
          <ErrorBoundary label="Titelseite">
            <HeroBriefing data={data} calendarRevealed={calendarRevealed} onArticleClick={(article) => handleArticleClick(article, 'top-stories')} isRead={isRead} markAsRead={markAsRead} />
          </ErrorBoundary>
          <ErrorBoundary label="Morgenueberblick">
            <MorningTiles data={data} />
          </ErrorBoundary>
        </div>

        {/* 2. AI & Tech */}
        {categoryArrays.ai.length > 0 && (
          <ErrorBoundary label="AI & Tech">
            <SectionDivider label="AI & Tech" colorClass="ai" />
            <TechHub
              aiArticles={categoryArrays.ai}
              onArticleClick={(article) => handleArticleClick(article, 'ai')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 3. KNAPP & Intralogistik */}
        {categoryArrays.knapp.length > 0 && (
          <ErrorBoundary label="KNAPP & Intralogistik">
            <SectionDivider label="KNAPP & Intralogistik" colorClass="knapp" />
            <CategorySection
              articles={categoryArrays.knapp}
              categoryId="knapp"
              label="KNAPP & Intralogistik"
              sectionId="knapp"
              onArticleClick={(article) => handleArticleClick(article, 'knapp')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 4. Dev Digest */}
        {categoryArrays.devDigest.length > 0 && (
          <ErrorBoundary label="Dev Digest">
            <SectionDivider label="Dev Digest" colorClass="dev" />
            <CategorySection
              articles={categoryArrays.devDigest}
              categoryId="dev_digest"
              label="Dev Digest"
              sectionId="dev-digest"
              onArticleClick={(article) => handleArticleClick(article, 'dev_digest')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 5. KI Modelle */}
        {categoryArrays.kiModelle.length > 0 && (
          <ErrorBoundary label="KI Modelle">
            <SectionDivider label="KI Modelle" colorClass="ki" />
            <CategorySection
              articles={categoryArrays.kiModelle}
              categoryId="ki_modelle"
              label="KI Modelle"
              sectionId="ki-modelle"
              onArticleClick={(article) => handleArticleClick(article, 'ki_modelle')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 6. Security */}
        {categoryArrays.security.length > 0 && (
          <ErrorBoundary label="Security">
            <SectionDivider label="Security" colorClass="security" />
            <CategorySection
              articles={categoryArrays.security}
              categoryId="security"
              label="Security"
              sectionId="security"
              onArticleClick={(article) => handleArticleClick(article, 'security')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 7. Welt */}
        {categoryArrays.world.length > 0 && (
          <ErrorBoundary label="Welt">
            <SectionDivider label="Welt" colorClass="world" />
            <CategorySection
              articles={categoryArrays.world}
              categoryId="world"
              label="Welt"
              sectionId="welt"
              onArticleClick={(article) => handleArticleClick(article, 'world')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 7. Steiermark */}
        {categoryArrays.local.length > 0 && (
          <ErrorBoundary label="Steiermark">
            <SectionDivider label="Steiermark" colorClass="local" />
            <CategorySection
              articles={categoryArrays.local}
              categoryId="local"
              label="Steiermark"
              sectionId="steiermark"
              onArticleClick={(article) => handleArticleClick(article, 'local')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        {/* 8. E-Mobilität */}
        {categoryArrays.ev.length > 0 && (
          <ErrorBoundary label="E-Mobilitaet">
            <SectionDivider label="E-Mobilität" colorClass="ev" />
            <CategorySection
              articles={categoryArrays.ev}
              categoryId="ev"
              label="E-Mobilität"
              sectionId="ev"
              onArticleClick={(article) => handleArticleClick(article, 'ev')}
              isRead={isRead}
            />
          </ErrorBoundary>
        )}

        <TimeMachineBar
          archiveEditions={archiveEditions}
          selectedEdition={selectedEdition}
          onGoToLatest={onGoToLatest}
          onGoToEdition={onGoToEdition}
        />
      </div>

      <Footer
        generated={data.generated}
        editionNumber={data.edition_number}
        clearAll={clearAll}
        readCount={readCount}
        onToast={handleToast}
      />

      {selectedArticle && (
        <ArticleModal
          article={selectedArticle.article}
          categoryId={selectedArticle.categoryId}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      <Toast message={toastMsg} visible={toastVisible} onDone={() => setToastVisible(false)} />
    </>
  );
}
