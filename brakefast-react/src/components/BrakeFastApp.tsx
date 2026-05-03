import { useCallback, useMemo, useState } from 'react';
import type { NewspaperData, Article } from '../types';
import { useActiveSection } from '../hooks/useActiveSection';
import { useReadTracker } from '../hooks/useReadTracker';
import { Footer } from './Footer';
import { Toast } from './Toast';
import { TimeMachineBar } from './TimeMachineBar';
import { ErrorBoundary } from './ErrorBoundary';
import { EditorialFirstScreen } from './EditorialFirstScreen';
import { EditorialCategorySection } from './EditorialCategorySection';
import { EditorialArticleModal } from './EditorialArticleModal';
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

const CATEGORY_DISPLAY: { key: string; sectionId: string; label: string; colorClass: string }[] = [
  { key: 'ai', sectionId: 'ai-tech', label: 'AI & Tech', colorClass: 'ai' },
  { key: 'knapp', sectionId: 'knapp', label: 'KNAPP & Intralogistik', colorClass: 'knapp' },
  { key: 'dev_digest', sectionId: 'dev-digest', label: 'Dev Digest', colorClass: 'dev' },
  { key: 'ki_modelle', sectionId: 'ki-modelle', label: 'KI Modelle', colorClass: 'ki' },
  { key: 'security', sectionId: 'security', label: 'Security', colorClass: 'security' },
  { key: 'world', sectionId: 'welt', label: 'Welt', colorClass: 'world' },
  { key: 'local', sectionId: 'steiermark', label: 'Steiermark', colorClass: 'local' },
  { key: 'ev', sectionId: 'ev', label: 'E-Mobilität', colorClass: 'ev' },
];

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

  const activeCategories = useMemo(() =>
    CATEGORY_DISPLAY
      .map(cfg => {
        const sourceArticles = data.categories[cfg.key]?.articles || [];
        return {
          ...cfg,
          articles: sourceArticles,
        };
      })
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
    <div className="ed-page-root">
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

      <div className="container">
        {activeCategories.map(cat => (
          <ErrorBoundary key={cat.key} label={cat.label}>
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
        <EditorialArticleModal
          article={selectedArticle.article}
          categoryId={selectedArticle.categoryId}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      <Toast message={toastMsg} visible={toastVisible} onDone={() => setToastVisible(false)} />
    </div>
  );
}
