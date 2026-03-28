import type { Article } from '../types';
import { CategorySection } from './CategorySection';

interface Props {
  aiArticles: Article[];
  onArticleClick: (article: Article) => void;
  isRead?: (link: string, title?: string) => boolean;
}

export function TechHub({ aiArticles, onArticleClick, isRead }: Props) {
  if (aiArticles.length === 0) return null;

  return (
    <CategorySection
      articles={aiArticles}
      categoryId="ai"
      label="AI & Tech"
      sectionId="ai-tech"
      onArticleClick={onArticleClick}
      isRead={isRead}
    />
  );
}
