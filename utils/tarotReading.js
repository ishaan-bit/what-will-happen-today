/**
 * The rule-based reading layer.
 *
 * Turns a drawn card (card + orientation + canonical meaning) into reading text
 * that is FAITHFUL to that exact card, following docs/tarot-reading-guide.md.
 * Used to:
 *   - add a card-grounded `punch` line to rule-mode picks (the static content
 *     pools have no punch — the LLM did; this gives rule mode parity),
 *   - enrich the tarot block's `meaning.deeper`,
 *   - compose a complete reading as a last-resort fallback when a category has
 *     no LLM and no rule content at all.
 *
 * Output uses the SAME prediction schema (teaser/full/punch/action/timing/
 * shareSnippet). Deterministic per (card, orientation, category, seed) so it is
 * stable within a day, varies per user, and rotates daily — like the rest of
 * the engine. Pure (no RN deps), so it is unit-testable in plain node.
 */

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function pick(list, seed) { return list[hashString(String(seed)) % list.length]; }

const AREA_NOUN = { love: 'someone close', career: 'the work', money: 'a number', mood: 'your own weather' };

// Sharp, card-grounded one-liners. {k} = the card's leading keyword for the
// orientation; {area} = a soft area noun. Faithful, a little unsettling.
const PUNCH_UPRIGHT = [
  '{Cap_k} is the whole story today; stop arguing with it.',
  'You already feel the {k}; you are just pretending you do not.',
  '{Cap_k} arrives whether you brace for it or not.',
  'The {k} is real today, and it is pointed at {area}.',
];
const PUNCH_REVERSED = [
  'The {k} is the exact thing you keep walking past.',
  'What you are calling fine is really {k}.',
  '{Cap_k} is asking to be named, not managed.',
  'The block is not out there; it is the {k} you will not look at.',
];

const DEEPER_UPRIGHT = [
  'This card lands on {area}. Let the {k} be true before you decide what to do with it.',
  'On {area}, the move is to meet the {k} head-on rather than soften it into a story.',
  'The {k} here is a door, not a verdict. Walk through it on the side of {area}.',
];
const DEEPER_REVERSED = [
  'Reversed, the {k} has gone inward. On {area}, the work is to surface it, gently and honestly.',
  'This is the {k} held too long. Loosen your grip on {area} and it starts to move.',
  'The {k} is not punishment; it is the part of {area} you have been postponing.',
];

const FULL_LINES_UPRIGHT = [
  'It will not announce itself loudly.',
  'You will feel the shift before you can name it.',
  'The first sign is small; the meaning is not.',
];
const FULL_LINES_REVERSED = [
  'It has been building quietly for a while.',
  'You have felt this edge before and looked away.',
  'The discomfort is the information.',
];

const TIMINGS = [
  "You'll feel this land before the day is over.",
  'It surfaces when you stop bracing for it.',
  'Watch the quiet hour, not the busy one.',
  'It shows up in an unguarded moment.',
];

const ACTIONS = {
  love: 'Say the true thing once, plainly, and let it sit.',
  career: 'Finish the one piece that makes your work visible.',
  money: 'Pause before the spend; move one amount the responsible way.',
  mood: 'Step away from the loudest input for ten clean minutes.',
};

function fill(tpl, k, area) {
  return tpl.replace('{Cap_k}', cap(k)).replace('{k}', k).replace('{area}', area);
}

function leadKeyword(draw) {
  const kws = draw?.meaning?.keywords || [];
  return (kws[0] || draw?.card?.name || 'the shift').toLowerCase();
}

/** A card-faithful sharp line. */
export function composePunch(draw, category, seed = 0) {
  if (!draw?.card) return null;
  const k = leadKeyword(draw);
  const area = AREA_NOUN[category] || 'today';
  const list = draw.orientation === 'reversed' ? PUNCH_REVERSED : PUNCH_UPRIGHT;
  return fill(pick(list, `${draw.card.id}|${draw.orientation}|${category}|punch|${seed}`), k, area);
}

/** A card-faithful deeper reading line (for the tarot block's meaning.deeper). */
export function composeDeeper(draw, category, seed = 0) {
  if (!draw?.card) return null;
  const k = leadKeyword(draw);
  const area = AREA_NOUN[category] || 'today';
  const list = draw.orientation === 'reversed' ? DEEPER_REVERSED : DEEPER_UPRIGHT;
  return fill(pick(list, `${draw.card.id}|${draw.orientation}|${category}|deep|${seed}`), k, area);
}

/**
 * A complete card-faithful reading (same schema) — last-resort fallback when a
 * category has no other content. The canonical blurb is already in the app voice
 * ("You'll step off a ledge today..."), so it makes a strong teaser.
 */
export function composeReading(draw, category, seed = 0) {
  if (!draw?.card) return null;
  const teaser = draw.meaning?.surface || `${draw.card.name} shapes ${category} today.`;
  const lines = draw.orientation === 'reversed' ? FULL_LINES_REVERSED : FULL_LINES_UPRIGHT;
  const full = `${teaser}\n${pick(lines, `${draw.card.id}|${category}|full|${seed}`)}`;
  return {
    id: `rule_${draw.card.id}_${category}`,
    teaser,
    full,
    punch: composePunch(draw, category, seed),
    action: ACTIONS[category] || ACTIONS.mood,
    timing: pick(TIMINGS, `${draw.card.id}|${category}|time|${seed}`),
    shareSnippet: teaser,
    source: 'rule_tarot',
  };
}
