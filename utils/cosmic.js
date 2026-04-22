/**
 * Cosmic flavor data — deterministic per day.
 *
 * NOT real astrology. Static lookup table that gives the app a mystic
 * "today's energy" line. Same value every call on same date.
 */

import { getDailySeed, seededRandom } from '@/utils/dateUtils';

const ENERGY_LINES = [
  { glyph: '☽', text: 'Moon waxing — pay attention to small returns' },
  { glyph: '☿', text: 'Mercury sharp — words land harder than usual' },
  { glyph: '♀', text: 'Venus warm — softness wins where force fails' },
  { glyph: '♂', text: 'Mars rising — direct action favoured today' },
  { glyph: '♃', text: 'Jupiter open — say yes once to something small' },
  { glyph: '♄', text: 'Saturn close — discipline pays before sundown' },
  { glyph: '☉', text: 'Sun bright — visibility is on your side today' },
  { glyph: '⚯', text: 'Energies cross — expect a plot twist by evening' },
  { glyph: '✦', text: 'Stillness in motion — rest sharpens what comes next' },
  { glyph: '☋', text: 'A door closes quietly — another opens you can\'t see yet' },
  { glyph: '⚸', text: 'Old patterns resurface — notice without acting' },
  { glyph: '☾', text: 'Intuition louder than logic today' },
];

/** Returns today's cosmic energy line. Deterministic per day. */
export function getDailyEnergy() {
  const seed = getDailySeed();
  const idx = Math.floor(seededRandom(seed * 31 + 33331) * ENERGY_LINES.length);
  return ENERGY_LINES[idx];
}

// ── Category sigils for the tarot face design ───────────────────────────

export const CATEGORY_SIGILS = {
  love:   { glyph: '♀', name: 'The Mirror' },
  career: { glyph: '⚔', name: 'The Path' },
  money:  { glyph: '◉', name: 'The Vessel' },
  mood:   { glyph: '☾', name: 'The Veil' },
};

// ── Affected categories — which 2 areas today's sky touches ─────────────

const ALL_CATS = ['love', 'career', 'money', 'mood'];

/** Returns the 2 categories most affected by today's sky. Deterministic per day. */
export function getAffectedCategories() {
  const seed = getDailySeed();
  const a = Math.floor(seededRandom(seed * 37 + 22221) * 4);
  let b = Math.floor(seededRandom(seed * 41 + 11111) * 4);
  if (b === a) b = (b + 1) % 4;
  return [ALL_CATS[a], ALL_CATS[b]];
}

// ── Continuity hints — feels like the system remembers ──────────────────

const CONTINUITY_LINES = [
  'This has been building.',
  'You\'ve seen this pattern before.',
  'This repeats every few days.',
  'A version of this showed up last week too.',
  'This tends to surface when ignored.',
  'The signal has been loud lately.',
];

/** Returns a continuity hint for a given category on today's date. ~40% of cards get one. */
export function getContinuityHint(category) {
  const seed = getDailySeed();
  const offset = { love: 1, career: 2, money: 3, mood: 4 }[category] || 0;
  const roll = seededRandom(seed * 43 + offset * 99 + 7777);
  if (roll > 0.4) return null;
  const idx = Math.floor(seededRandom(seed * 47 + offset * 137 + 3333) * CONTINUITY_LINES.length);
  return CONTINUITY_LINES[idx];
}
