import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ArticleSchema, NewspaperDataSchema, MonitoringDataSchema } from './schemas';

describe('NewspaperDataSchema', () => {
  it('validates minimal valid data', () => {
    const input = { generated: '2026-01-01', totalArticles: 0, categories: {} };
    const result = z.safeParse(NewspaperDataSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.generated).toBe('2026-01-01');
      expect(result.data.totalArticles).toBe(0);
      expect(result.data.categories).toEqual({});
    }
  });

  it('applies defaults for missing optional fields', () => {
    const input = { categories: {} };
    const result = z.safeParse(NewspaperDataSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.generated).toBe('string');
      expect(result.data.totalArticles).toBe(0);
    }
  });

  it('fails for completely invalid input', () => {
    expect(z.safeParse(NewspaperDataSchema, 42).success).toBe(false);
    expect(z.safeParse(NewspaperDataSchema, null).success).toBe(false);
    expect(z.safeParse(NewspaperDataSchema, [1, 2, 3]).success).toBe(false);
  });

  it('preserves unknown fields via passthrough', () => {
    const input = {
      generated: '2026-01-01',
      totalArticles: 0,
      categories: {},
      customField: 'extra-data',
    };
    const result = z.safeParse(NewspaperDataSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)['customField']).toBe('extra-data');
    }
  });

  it('validates data with categories and articles', () => {
    const input = {
      generated: '2026-03-28T06:00:00Z',
      totalArticles: 1,
      categories: {
        ai: {
          name: 'AI',
          emoji: '🤖',
          css_class: 'ai',
          articles: [
            { title: 'AI News', link: 'https://example.com/ai', description: 'Desc', date: '2026-03-28', source: 'Test' },
          ],
        },
      },
    };
    const result = z.safeParse(NewspaperDataSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categories['ai'].articles).toHaveLength(1);
      expect(result.data.categories['ai'].articles[0].title).toBe('AI News');
    }
  });
});

describe('ArticleSchema', () => {
  it('validates article with only required fields', () => {
    const input = { title: 'T', link: 'http://x.com', description: 'D', date: '2026-01-01', source: 'S' };
    const result = z.safeParse(ArticleSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('T');
      expect(result.data.link).toBe('http://x.com');
    }
  });

  it('applies catch defaults for missing description, date, source', () => {
    const input = { title: 'T', link: 'http://x.com' };
    const result = z.safeParse(ArticleSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe('');
      expect(result.data.date).toBe('');
      expect(result.data.source).toBe('');
    }
  });
});

describe('MonitoringDataSchema', () => {
  it('validates a minimal valid monitoring object', () => {
    const input = {
      generated: '2026-01-01T00:00:00Z',
      period: '7d',
      agents: {
        main: { model: 'gpt-4', status: 'active', sessions_total: 10 },
        worker: { model: 'gpt-3.5', status: 'active', sessions_total: 5 },
        expert: { model: 'claude', status: 'idle', sessions_total: 2 },
      },
      activity_7d: [],
      costs: { today_usd: 1.5, month_usd: 30, daily_limit_usd: 10, monthly_limit_usd: 100, history_7d: [] },
      routing: [],
      models: [],
      system: { disk_percent: 45, uptime: '5d', containers: 3, last_heartbeat: '', last_audit: '', heartbeat_status: 'ok' },
      recent_events: [],
    };
    const result = z.safeParse(MonitoringDataSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.period).toBe('7d');
      expect(result.data.agents.main.model).toBe('gpt-4');
    }
  });

  it('applies catch defaults for missing fields', () => {
    const input = {};
    const result = z.safeParse(MonitoringDataSchema, input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.generated).toBe('');
      expect(result.data.period).toBe('');
      expect(result.data.activity_7d).toEqual([]);
      expect(result.data.routing).toEqual([]);
    }
  });
});
