// ─── Article ───
export interface Article {
  title: string;
  link: string;
  description: string;
  date: string;
  source: string;
  image?: string;
  summary?: string;
  reading_time_minutes?: number;
  relevance_score?: number;
  otto_comment?: string;
  category?: string;
}

// ─── Category ───
export interface Category {
  name: string;
  emoji: string;
  css_class: string;
  articles: Article[];
}

// ─── KI Modelle ───
export interface KiModelleItem {
  title: string;
  content: string;
  source: string;
  date: string;
  tag: string;
  image?: string;
}

export interface KiModelleData {
  releases?: KiModelleItem;
  benchmarks?: KiModelleItem;
  pricing?: KiModelleItem;
  tools?: KiModelleItem;
}

// ─── Dev Digest ───
export interface DevDigestItem {
  title: string;
  content: string;
  source: string;
  date: string;
  tag: string;
  image?: string;
}

export interface DevDigestData {
  github_trending?: DevDigestItem;
  releases?: DevDigestItem;
  hn_top?: DevDigestItem;
  security_advisory?: DevDigestItem;
}

// ─── Weather ───
export interface WeatherData {
  temp: number;
  description: string;
  feelsLike: number;
  min: number;
  max: number;
  icon?: string;
  location?: string;
  forecast?: string;
}

// ─── Markets ───
export interface MarketIndex {
  symbol: string;
  label: string;
  value: string;
  change: string;
}

export interface MarketInsight {
  text: string;
}

export interface MarketsData {
  indices: MarketIndex[];
  insights: MarketInsight[];
  updated: string;
  mood?: string;
  mood_detail?: string;
}

// ─── Calendar ───
export interface CalendarEvent {
  time: string;
  title: string;
}

// ─── Day Info ───
export interface DayInfo {
  namenstag?: string;
  sunrise: string;
  sunset: string;
  dayLength?: string;
}

// ─── Quote ───
export interface DailyQuote {
  text: string;
  author: string;
}

// ─── VPS Status ───
export interface VpsStatus {
  disk: string;
  uptime: string;
  containers: number;
  lastAudit?: string;
}

// ─── History Fact ───
export interface HistoryFact {
  year: number;
  text: string;
}

// ─── Bauernregel ───
export interface Bauernregel {
  text: string;
  meaning?: string;
}

// ─── Pollen ───
export interface PollenData {
  level: string;
  types: string[];
  description: string;
}

// ─── Widgets ───
export interface Widgets {
  vps?: VpsStatus;
  dayInfo?: DayInfo;
  quote?: DailyQuote;
  weather?: WeatherData;
  calendar?: CalendarEvent[];
  history?: HistoryFact;
  bauernregel?: Bauernregel;
  pollen?: PollenData;
}

// ─── Root ───
export interface NewspaperData {
  generated: string;
  totalArticles: number;
  headline?: string;
  editorial?: string;
  weather?: string;
  widgets?: Widgets;
  categories: Record<string, Category>;
  edition_number?: number;
  reading_time_total?: number;
  ki_modelle?: KiModelleData;
  dev_digest?: DevDigestData;
  markets?: MarketsData;
  focus_topics?: string[];
  reminders?: string[];
}
