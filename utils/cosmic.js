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
