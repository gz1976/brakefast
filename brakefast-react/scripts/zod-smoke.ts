#!/usr/bin/env tsx
/**
 * PIPE-02 / Phase 4.1 Plans 04+07 — Zod-smoke validation for produced data.json.
 *
 * Validates a candidate data.json against the React frontend's NewspaperDataSchema
 * and per-article ArticleSchema. Exits 0 on success, 1 on validation failure.
 *
 * Usage:
 *   npx tsx scripts/zod-smoke.ts                       # default: fetches https://ottobot.net/latest/data.json
 *   npx tsx scripts/zod-smoke.ts <path-to-data.json>   # local file
 *   npx tsx scripts/zod-smoke.ts <https://url>         # explicit URL
 *   curl -sf <url> | npx tsx scripts/zod-smoke.ts -    # stdin
 *   BRAKEFAST_URL=<url> npx tsx scripts/zod-smoke.ts   # env override
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { ArticleSchema, NewspaperDataSchema } from '../src/utils/schemas.js';

const DEFAULT_URL = 'https://ottobot.net/latest/data.json';

async function readInput(arg: string | undefined): Promise<string> {
  if (arg === '-') {
    return readFileSync(0, 'utf8');
  }
  const url = arg ?? process.env.BRAKEFAST_URL ?? DEFAULT_URL;
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`);
    }
    return await res.text();
  }
  return readFileSync(url, 'utf8');
}

async function main(): Promise<number> {
  const arg = process.argv[2];

  let raw: string;
  try {
    raw = await readInput(arg);
  } catch (err) {
    console.error(`[zod-smoke] failed to read input: ${(err as Error).message}`);
    return 2;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`[zod-smoke] JSON parse error: ${(err as Error).message}`);
    return 1;
  }

  const newspaperResult = NewspaperDataSchema.safeParse(parsed);
  if (!newspaperResult.success) {
    console.error('[zod-smoke] NewspaperDataSchema failed:');
    console.error(JSON.stringify(newspaperResult.error.flatten(), null, 2));
    return 1;
  }

  const data = newspaperResult.data as Record<string, unknown>;
  const categories = (data.categories ?? {}) as Record<string, { articles?: unknown[] }>;

  let total = 0;
  let invalid = 0;
  const failures: Array<{ category: string; index: number; error: string }> = [];

  for (const [catName, catValue] of Object.entries(categories)) {
    const articles = catValue?.articles ?? [];
    for (let i = 0; i < articles.length; i++) {
      total += 1;
      const r = ArticleSchema.safeParse(articles[i]);
      if (!r.success) {
        invalid += 1;
        failures.push({
          category: catName,
          index: i,
          error: JSON.stringify(r.error.flatten().fieldErrors),
        });
      }
    }
  }

  if (invalid > 0) {
    console.error(`[zod-smoke] ${invalid} of ${total} articles fail ArticleSchema:`);
    for (const f of failures.slice(0, 10)) {
      console.error(`  - ${f.category}[${f.index}]: ${f.error}`);
    }
    if (failures.length > 10) {
      console.error(`  ...and ${failures.length - 10} more`);
    }
    return 1;
  }

  console.log(
    `[zod-smoke] OK — NewspaperDataSchema valid; ${total} articles across ${Object.keys(categories).length} categories all pass ArticleSchema.`,
  );
  return 0;
}

main().then((code) => process.exit(code));
