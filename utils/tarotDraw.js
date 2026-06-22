/**
 * The Draw — a deterministic daily 4-card spread.
 *
 * Given (installSalt, dateKey, ruleBucket) this draws one tarot card +
 * orientation per life area. It is:
 *   - stable per user per day (same result every call that day),
 *   - varied across users (installSalt) and across ops re-picks (bucket),
 *   - no-duplicate within a day's spread,
 *   - suit-aware (Cups lean to love, Pentacles to money, etc.).
 *
 * Both engines render the SAME draw: the rule engine and the LLM engine
 * each attach this card to their generated text, so RULE mode is a real
 * tarot reading offline and LLM mode is a real tarot reading online.
 */

import { TAROT_DECK, SUIT_AFFINITY, cardMeaning } from '@/content/tarotDeck';
import { seededRandom } from '@/utils/dateUtils';

export const SPREAD_CATEGORIES = ['love', 'career', 'money', 'mood'];

// Probability a drawn card lands reversed. Kept below 50% so most readings
// are upright (gentler, more shareable) but reversals still show up daily.
const REVERSED_RATE = 0.34;

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function affinity(card, category) {
  const lean = SUIT_AFFINITY[card.arcana === 'major' ? 'major' : card.suit] || SUIT_AFFINITY.major;
  return Math.max(0.25, lean[category] || 1);
}

function weightedPick(cards, category, r) {
  const weights = cards.map((c) => affinity(c, category));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < cards.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return cards.length - 1;
}

/**
 * Draw the day's spread.
 * @returns Array<{ category, position, card, orientation, meaning }>
 */
export function drawDailySpread({ installSalt = 'anon', dateKey = '', bucket = '0' } = {}) {
  const used = new Set();
  const spread = [];

  SPREAD_CATEGORIES.forEach((category, position) => {
    const seed = hashString(`${installSalt}|${bucket}|${dateKey}|${category}`);
    const available = TAROT_DECK.filter((c) => !used.has(c.id));
    const pickIndex = weightedPick(available, category, seededRandom(seed));
    const card = available[pickIndex];
    used.add(card.id);

    const orientation = seededRandom((seed ^ 0x9e3779b9) >>> 0) < REVERSED_RATE
      ? 'reversed'
      : 'upright';

    spread.push({
      category,
      position,
      card,
      orientation,
      meaning: cardMeaning(card, orientation),
    });
  });

  return spread;
}

/** Convenience: the spread keyed by category. */
export function drawDailySpreadByCategory(opts) {
  const spread = drawDailySpread(opts);
  return spread.reduce((acc, draw) => {
    acc[draw.category] = draw;
    return acc;
  }, {});
}

/**
 * The compact `tarot` block attached to each prediction and consumed by the
 * card UI. Back-compat: any reading without this block falls back to the
 * legacy CATEGORY_SIGILS design.
 */
export function tarotBlockFromDraw(draw, deeperFallback = null) {
  if (!draw?.card) return null;
  const { card, orientation, meaning } = draw;
  return {
    cardId: card.id,
    cardName: card.name,
    arcana: card.arcana,
    suit: card.suit,
    number: card.number,
    court: card.court || null,
    orientation,
    glyph: card.glyph,
    keywords: meaning?.keywords || [],
    meaning: {
      surface: meaning?.surface || '',
      deeper: deeperFallback || meaning?.surface || '',
    },
  };
}
