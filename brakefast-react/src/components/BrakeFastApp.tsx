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
import { EditorialFirstScreen } from './EditorialFirstScreen';
import { EditorialCategorySection } from './EditorialCategorySection';
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

  // Feature flag: ?editorial=1 switches the first screen to the Newsprint EditorialFirstScreen.
  // Phase 6 (ROLL-02) deletes this flag and the legacy branch below.
  const editorialFlag = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('editorial') === '1';
  }, []);

  // Category display config: maps data keys to display properties
  // Order here determines render order on the page
  const CATEGORY_DISPLAY: { key: string; sectionId: string; label: string; colorClass: string; component?: 'techhub' }[] = [
    { key: 'ai', sectionId: 'ai-tech', label: 'AI & Tech', colorClass: 'ai', component: 'techhub' },
    { key: 'knapp', sectionId: 'knapp', label: 'KNAPP & Intralogistik', colorClass: 'knapp' },
    { key: 'dev_digest', sectionId: 'dev-digest', label: 'Dev Digest', colorClass: 'dev' },
    { key: 'ki_modelle', sectionId: 'ki-modelle', label: 'KI Modelle', colorClass: 'ki' },
    { key: 'security', sectionId: 'security', label: 'Security', colorClass: 'security' },
    { key: 'world', sectionId: 'welt', label: 'Welt', colorClass: 'world' },
    { key: 'local', sectionId: 'steiermark', label: 'Steiermark', colorClass: 'local' },
    { key: 'ev', sectionId: 'ev', label: 'E-Mobilität', colorClass: 'ev' },
  ];

  const activeCategories = useMemo(() =>
    CATEGORY_DISPLAY
      .map(cfg => ({
        ...cfg,
        articles: data.categories[cfg.key]?.articles || [],
      }))
      .filter(cfg => cfg.articles.length > 0),
    [data]
  );

  const sections = useMemo<NavSection[]>(() => {
    const s: NavSection[] = [{ id: 'top-stories', label: 'Titelseite' }];
    for (const cat of activeCategories) {
      s.push({ id: cat.sectionId, label: cat.label });
    }
    return s;
  }, [activeCategories]);

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const { activeId, scrollTo } = useActiveSection(sectionIds);

  const handleArticleClick = (article: Article, categoryId?: string) => {
    markAsRead(article.link, article.title);
    setSelectedArticle({ article, categoryId: categoryId || 'default' });
  };

  return (
    <>
      {editorialFlag ? (
        <ErrorBoundary label="Titelseite">
          <EditorialFirstScreen
            data={data}
            calendarRevealed={calendarRevealed}
            onArticleClick={(article) => handleArticleClick(article, 'top-stories')}
            isRead={isRead}
            markAsRead={markAsRead}
            sections={sections}
            activeSectionId={activeId}
            onSectionNavigate={scrollTo}
            editionNumber={data.edition_number}
            generatedDate={data.generated}
            onCalendarRevealToggle={() => setCalendarRevealed(prev => !prev)}
          />
        </ErrorBoundary>
      ) : (
        <>
          <Masthead
            date={data.generated}
            totalArticles={data.totalArticles}
            editionNumber={data.edition_number}
            readingTimeTotal={data.reading_time_total}
            onLogoClick={() => setCalendarRevealed(prev => !prev)}
          />

          <NavTabs sections={sections} activeId={activeId} onNavigate={scrollTo} />

          {/* First Screen: Hero + Morning Tiles fill iPad viewport */}
          <div className="first-screen container" id="main-content">
            <ErrorBoundary label="Titelseite">
              <HeroBriefing data={data} calendarRevealed={calendarRevealed} onArticleClick={(article) => handleArticleClick(article, 'top-stories')} isRead={isRead} markAsRead={markAsRead} />
            </ErrorBoundary>
            <ErrorBoundary label="Morgenueberblick">
              <MorningTiles data={data} />
            </ErrorBoundary>
          </div>
        </>
      )}

      <div className="container">
        {activeCategories.map(cat => (
          <ErrorBoundary key={cat.key} label={cat.label}>
            {editorialFlag ? (
              <EditorialCategorySection
                articles={cat.articles}
                categoryId={cat.key}
                label={cat.label}
                sectionId={cat.sectionId}
                editionNumber={data.edition_number}
                generatedDate={data.generated}
                onArticleClick={(article) => handleArticleClick(article, cat.key)}
                isRead={isRead}
              />
            ) : (
              <>
                <SectionDivider label={cat.label} colorClass={cat.colorClass} />
                {cat.component === 'techhub' ? (
                  <TechHub
                    aiArticles={cat.articles}
                    onArticleClick={(article) => handleArticleClick(article, cat.key)}
                    isRead={isRead}
                  />
                ) : (
                  <CategorySection
                    articles={cat.articles}
                    categoryId={cat.key}
                    label={cat.label}
                    sectionId={cat.sectionId}
                    onArticleClick={(article) => handleArticleClick(article, cat.key)}
                    isRead={isRead}
                  />
                )}
              </>
            )}
          </ErrorBoundary>
        ))}

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
