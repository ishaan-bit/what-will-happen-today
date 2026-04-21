#!/usr/bin/env node
/**
 * Standalone runner — node scripts/run-daily-predictions.js
 * (same pattern as TriggerMap local-worker)
 *
 * Requires Ollama running locally: ollama serve
 * Run from backend/ directory.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from backend root
const { default: dotenv } = await import('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { generateDailyPredictions } = await import('../jobs/generateDailyPredictions.js');

generateDailyPredictions()
  .then((result) => {
    console.log('[LLM] Done:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[LLM] Fatal:', err);
    process.exit(1);
  });
