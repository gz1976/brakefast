// ─── Article ───
export interface Article {
  title: string;
  headline?: string;
  link: string;
  canonical_url?: string;
  description: string;
  dek?: string;
  briefing_blurb?: string;
  date: string;
  published_at?: string;
  source: string;
  image?: string;
  best_image?: string;
  summary?: string;
  bullet_points?: string[];
  why_it_matters?: string;
  reading_time_minutes?: number;
  relevance_score?: number;
  otto_comment?: string;
  category?: string;
  author?: string;
  topics?: string[];
  entities?: string[];
  full_text?: string;
  content_extracted?: boolean;
  content_quality?: 'high' | 'medium' | 'low';
  summary_quality_score?: number;
  image_quality_score?: number;
  needs_review?: boolean;
  source_url?: string;
  discussion_url?: string;
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
  link?: string;
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
  link?: string;
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
  humidity?: number;
  wind?: string;
  uvIndex?: number;
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
  wiki?: string;
  image?: string;
  url?: string;
  description?: string; // 3-5 sentence detail for modal/expand
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
  updated?: string;
  detail?: Array<{ name: string; level: number }>;
}

// ─── Word of Day ───
export interface WordOfDay {
  word: string;
  explanation?: string;
  meaning?: string;
  origin?: string;
  example?: string;
}

// ─── Widgets ───
export interface Widgets {
  vps?: VpsStatus;
  dayInfo?: DayInfo;
  quote?: DailyQuote;
  weather?: WeatherData;
  calendar?: CalendarEvent[];
  history?: HistoryFact | HistoryFact[];
  bauernregel?: Bauernregel;
  pollen?: PollenData;
  word_of_day?: WordOfDay;
}

// ─── Monitoring ───
export interface AgentActivity {
  date: string;
  main: number;
  worker: number;
  expert: number;
}

export interface CostEntry {
  date: string;
  total_usd: number;
  calls: number;
  by_model: Record<string, number>;
}

export interface RoutingDecision {
  agent: 'self' | 'worker' | 'expert';
  count: number;
}

export interface ModelStats {
  model: string;
  tier: string;
  calls: number;
  avg_latency_ms: number;
  errors: number;
  success_rate: number;
  estimated_cost_usd: number;
}

export interface MonitoringData {
  generated: string;
  period: string;
  agents: {
    main: { model: string; status: string; sessions_total: number };
    worker: { model: string; status: string; sessions_total: number };
    expert: { model: string; status: string; sessions_total: number };
  };
  activity_7d: AgentActivity[];
  costs: {
    today_usd: number;
    month_usd: number;
    daily_limit_usd: number;
    monthly_limit_usd: number;
    history_7d: CostEntry[];
  };
  routing: RoutingDecision[];
  models: ModelStats[];
  system: {
    disk_percent: number;
    uptime: string;
    containers: number;
    last_heartbeat: string;
    last_audit: string;
    heartbeat_status: string;
  };
  recent_events: Array<{
    timestamp: string;
    type: string;
    agent: string;
    summary: string;
  }>;
}

// ─── Morning Tiles ───
export interface KnappSignal {
  text: string;
  title?: string;
  summary?: string;
  source?: string;
  url?: string;
  image?: string;
  tag?: string;
}

export interface MorningTileKnapp {
  headline?: string;
  signals: KnappSignal[];
}

// ─── World Headlines ───
export interface WorldHeadline {
  text: string;
  source?: string;
  summary?: string;
  url?: string;
}

// ─── Media Tip (Podcast / Article / Video) ───
export interface MediaTip {
  title: string;
  type: string;       // "Podcast", "Artikel", "Video"
  source: string;     // "Lex Fridman Podcast"
  url?: string;
  duration?: string;  // "2h 15m" or "8 min Lesezeit"
}

// ─── Streaming Tip ───
export interface StreamingTip {
  title: string;
  platform: string;
  type: string;
  url?: string;
}

// ─── Local Event ───
export interface LocalEvent {
  title: string;
  date: string;
  location: string;
  type?: string;
  url?: string;
}

export interface MorningTilesData {
  knapp?: MorningTileKnapp;
  headlines?: WorldHeadline[];
  streaming?: StreamingTip[];
  events?: LocalEvent[];
  media_tip?: MediaTip;
  media_tips?: MediaTip[];
}

export interface ArchiveEdition {
  date: string;
  display_date: string;
  year: string;
  month: string;
  day: string;
  edition_number?: number;
  generated?: string;
  published_at?: string;
  article_count?: number;
  headline?: string;
  top_story?: string;
  data_url: string;
  legacy_html_url?: string;
  react_url?: string;
}

export interface ArchiveIndex {
  generated: string;
  count: number;
  editions: ArchiveEdition[];
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
  morning_tiles?: MorningTilesData;
  focus_topics?: string[];
  reminders?: string[];
}
