import type { Article } from '../types';
import { ArticleCard } from './ArticleCard';
import { SectionHeader } from './SectionHeader';

interface Props {
  id: string;
  icon: string;
  title: string;
  articles: Article[];
  categoryLabel: string;
  colorClass: string;
  tagClass: string;
  onArticleClick: (article: Article) => void;
}

export function ArticleGrid({ id, icon, title, articles, categoryLabel, colorClass, tagClass, onArticleClick }: Props) {
  if (articles.length === 0) return null;

  return (
    <>
      <SectionHeader
        id={id}
        icon={icon}
        title={title}
        tag={{ text: `${articles.length} Artikel`, colorClass: tagClass }}
      />
      <div className="article-grid">
        {articles.map((article, i) => (
          <ArticleCard
            key={i}
            article={article}
            categoryLabel={categoryLabel}
            colorClass={colorClass}
            catId={id === 'ai-tech' ? 'ai' : id}
            onArticleClick={onArticleClick}
          />
        ))}
      </div>
    </>
  );
}
