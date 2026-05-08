import { z } from 'zod';
import type { NewspaperData } from '../types';

// ─── Article Schema ───

/** Zod schema for Article. Required: title, link. All others lenient with defaults. */
export const ArticleSchema = z.object({
  title: z.string(),
  headline: z.string().optional(),
  link: z.string(),
  canonical_url: z.string().optional(),
  description: z.string().catch(''),
  dek: z.string().optional(),
  briefing_blurb: z.string().optional(),
  date: z.string().catch(''),
  published_at: z.string().optional(),
  source: z.string().catch(''),
  image: z.string().optional(),
  best_image: z.string().optional(),
  summary: z.string().optional(),
  bullet_points: z.array(z.string()).optional(),
  why_it_matters: z.string().optional(),
  // --auto curation emits some fields as "" or null instead of omitting them;
  // .catch(undefined) drops invalid values to keep the typed shape intact.
  reading_time_minutes: z.number().optional().catch(undefined),
  relevance_score: z.number().optional().catch(undefined),
  otto_comment: z.string().optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  topics: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
  full_text: z.string().optional(),
  content_extracted: z.boolean().optional().catch(undefined),
  content_quality: z.enum(['high', 'medium', 'low']).optional().catch(undefined),
  summary_quality_score: z.number().optional().catch(undefined),
  image_quality_score: z.number().optional().catch(undefined),
  needs_review: z.boolean().optional().catch(undefined),
  source_url: z.string().optional(),
  discussion_url: z.string().optional(),
}).passthrough();

// ─── Category Schema ───

/** Zod schema for Category with lenient defaults for emoji and css_class. */
export const CategorySchema = z.object({
  name: z.string(),
  emoji: z.string().catch(''),
  css_class: z.string().catch(''),
  articles: z.array(ArticleSchema).default([]),
}).passthrough();

// ─── Widget Sub-Schemas ───

const WeatherSchema = z.object({
  temp: z.number(),
  description: z.string(),
  feelsLike: z.number(),
  min: z.number(),
  max: z.number(),
  icon: z.string().optional(),
  location: z.string().optional(),
  forecast: z.string().optional(),
  humidity: z.number().optional(),
  wind: z.string().optional(),
  uvIndex: z.number().optional(),
}).passthrough();

const MarketIndexSchema = z.object({
  symbol: z.string(),
  label: z.string(),
  value: z.string(),
  change: z.string(),
}).passthrough();

const MarketsSchema = z.object({
  indices: z.array(MarketIndexSchema).default([]),
  insights: z.array(z.object({ text: z.string() }).passthrough()).default([]),
  updated: z.string().catch(''),
  mood: z.string().optional(),
  mood_detail: z.string().optional(),
}).passthrough();

const CalendarEventSchema = z.object({
  time: z.string(),
  title: z.string(),
}).passthrough();

const DayInfoSchema = z.object({
  namenstag: z.string().optional(),
  sunrise: z.string().catch(''),
  sunset: z.string().catch(''),
  dayLength: z.string().optional(),
}).passthrough();

const DailyQuoteSchema = z.object({
  text: z.string(),
  author: z.string(),
}).passthrough();

const VpsStatusSchema = z.object({
  disk: z.string(),
  uptime: z.string(),
  containers: z.number(),
  lastAudit: z.string().optional(),
}).passthrough();

const HistoryFactSchema = z.object({
  year: z.number(),
  text: z.string(),
  wiki: z.string().optional(),
  image: z.string().optional(),
  url: z.string().optional(),
  description: z.string().optional(),
}).passthrough();

const BauernregelSchema = z.object({
  text: z.string(),
  meaning: z.string().optional(),
}).passthrough();

const PollenSchema = z.object({
  level: z.string(),
  types: z.array(z.string()),
  description: z.string(),
  updated: z.string().optional(),
}).passthrough();

const WordOfDaySchema = z.object({
  word: z.string(),
  explanation: z.string().optional(),
  meaning: z.string().optional(),
  origin: z.string().optional(),
  example: z.string().optional(),
}).passthrough();

/** Zod schema for Widgets -- all sub-widgets optional. */
export const WidgetsSchema = z.object({
  vps: VpsStatusSchema.optional(),
  dayInfo: DayInfoSchema.optional(),
  quote: DailyQuoteSchema.optional(),
  weather: WeatherSchema.optional(),
  calendar: z.array(CalendarEventSchema).optional(),
  history: z.union([HistoryFactSchema, z.array(HistoryFactSchema)]).optional(),
  bauernregel: BauernregelSchema.optional(),
  pollen: PollenSchema.optional(),
  word_of_day: WordOfDaySchema.optional(),
}).passthrough();

// ─── KI Modelle / Dev Digest ───

const KiModelleItemSchema = z.object({
  title: z.string(),
  content: z.string(),
  source: z.string(),
  date: z.string(),
  tag: z.string(),
  image: z.string().optional(),
  link: z.string().optional(),
}).passthrough();

const KiModelleDataSchema = z.object({
  releases: KiModelleItemSchema.optional(),
  benchmarks: KiModelleItemSchema.optional(),
  pricing: KiModelleItemSchema.optional(),
  tools: KiModelleItemSchema.optional(),
}).passthrough();

const DevDigestItemSchema = z.object({
  title: z.string(),
  content: z.string(),
  source: z.string(),
  date: z.string(),
  tag: z.string(),
  image: z.string().optional(),
  link: z.string().optional(),
}).passthrough();

const DevDigestDataSchema = z.object({
  github_trending: DevDigestItemSchema.optional(),
  releases: DevDigestItemSchema.optional(),
  hn_top: DevDigestItemSchema.optional(),
  security_advisory: DevDigestItemSchema.optional(),
}).passthrough();

// ─── Morning Tiles ───

const KnappSignalSchema = z.object({
  text: z.string(),
  source: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const MorningTileKnappSchema = z.object({
  headline: z.string().optional(),
  signals: z.array(KnappSignalSchema).default([]),
}).passthrough();

const WorldHeadlineSchema = z.object({
  text: z.string(),
  source: z.string().optional(),
  summary: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const MediaTipSchema = z.object({
  title: z.string(),
  type: z.string(),
  source: z.string(),
  url: z.string().optional(),
  duration: z.string().optional(),
}).passthrough();

const StreamingTipSchema = z.object({
  title: z.string(),
  platform: z.string(),
  type: z.string(),
  url: z.string().optional(),
}).passthrough();

const LocalEventSchema = z.object({
  title: z.string(),
  date: z.string(),
  location: z.string(),
  type: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

const MorningTilesDataSchema = z.object({
  knapp: MorningTileKnappSchema.optional(),
  headlines: z.array(WorldHeadlineSchema).optional(),
  streaming: z.array(StreamingTipSchema).optional(),
  events: z.array(LocalEventSchema).optional(),
  media_tip: MediaTipSchema.optional(),
}).passthrough();

// ─── NewspaperData Schema ───

/** Zod schema for the root NewspaperData structure. Lenient defaults for all optional fields. */
export const NewspaperDataSchema = z.object({
  generated: z.string().optional(),
  totalArticles: z.number().catch(0),
  headline: z.string().optional(),
  editorial: z.string().optional(),
  weather: z.string().optional(),
  widgets: WidgetsSchema.optional(),
  categories: z.record(z.string(), CategorySchema).default({}),
  edition_number: z.number().optional(),
  reading_time_total: z.number().optional(),
  ki_modelle: KiModelleDataSchema.optional(),
  dev_digest: DevDigestDataSchema.optional(),
  markets: MarketsSchema.optional(),
  morning_tiles: MorningTilesDataSchema.optional(),
  focus_topics: z.array(z.string()).optional(),
  reminders: z.array(z.string()).optional(),
}).passthrough();

// ─── MonitoringData Schema ───

const AgentInfoSchema = z.object({
  model: z.string().catch(''),
  status: z.string().catch(''),
  sessions_total: z.number().catch(0),
}).passthrough();

const AgentActivitySchema = z.object({
  date: z.string(),
  main: z.number().catch(0),
  worker: z.number().catch(0),
  expert: z.number().catch(0),
}).passthrough();

const CostEntrySchema = z.object({
  date: z.string(),
  total_usd: z.number().catch(0),
  calls: z.number().catch(0),
  by_model: z.record(z.string(), z.number()).default({}),
}).passthrough();

const RoutingDecisionSchema = z.object({
  agent: z.enum(['self', 'worker', 'expert']),
  count: z.number().catch(0),
}).passthrough();

const ModelStatsSchema = z.object({
  model: z.string(),
  tier: z.string().catch(''),
  calls: z.number().catch(0),
  avg_latency_ms: z.number().catch(0),
  errors: z.number().catch(0),
  success_rate: z.number().catch(0),
  estimated_cost_usd: z.number().catch(0),
}).passthrough();

const SystemSchema = z.object({
  disk_percent: z.number().catch(0),
  uptime: z.string().catch(''),
  containers: z.number().catch(0),
  last_heartbeat: z.string().catch(''),
  last_audit: z.string().catch(''),
  heartbeat_status: z.string().catch(''),
}).passthrough();

const RecentEventSchema = z.object({
  timestamp: z.string(),
  type: z.string(),
  agent: z.string(),
  summary: z.string(),
}).passthrough();

/** Zod schema for MonitoringData with lenient defaults. */
export const MonitoringDataSchema = z.object({
  generated: z.string().catch(''),
  period: z.string().catch(''),
  agents: z.object({
    main: AgentInfoSchema,
    worker: AgentInfoSchema,
    expert: AgentInfoSchema,
  }).passthrough().catch({ main: { model: '', status: '', sessions_total: 0 }, worker: { model: '', status: '', sessions_total: 0 }, expert: { model: '', status: '', sessions_total: 0 } }),
  activity_7d: z.array(AgentActivitySchema).default([]),
  costs: z.object({
    today_usd: z.number().catch(0),
    month_usd: z.number().catch(0),
    daily_limit_usd: z.number().catch(0),
    monthly_limit_usd: z.number().catch(0),
    history_7d: z.array(CostEntrySchema).default([]),
  }).passthrough().catch({ today_usd: 0, month_usd: 0, daily_limit_usd: 0, monthly_limit_usd: 0, history_7d: [] }),
  routing: z.array(RoutingDecisionSchema).default([]),
  models: z.array(ModelStatsSchema).default([]),
  system: SystemSchema.catch({ disk_percent: 0, uptime: '', containers: 0, last_heartbeat: '', last_audit: '', heartbeat_status: '' }),
  recent_events: z.array(RecentEventSchema).default([]),
}).passthrough();

// ─── Type Drift Check ───
// This assertion catches drift between Zod schemas and TypeScript interfaces.
// If NewspaperData changes fields, this line will produce a compile error.
type _CheckNewspaper = z.infer<typeof NewspaperDataSchema> extends NewspaperData ? true : never;
// Suppress unused type warning
const _typeCheck: _CheckNewspaper = true;
void _typeCheck;
