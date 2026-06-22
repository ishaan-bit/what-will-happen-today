/**
 * The Deck — a full 78-card Rider-Waite tarot deck with concise, accurate
 * upright/reversed meanings.
 *
 * This is the shared substrate for BOTH engines. utils/tarotDraw.js draws a
 * deterministic daily 4-card spread from this deck; the rule engine and the
 * LLM engine both render the drawn card's name, orientation and canonical
 * meaning, while their generated text becomes "the reading" underneath.
 *
 * Cards are kept lean: glyph + area affinity are derived from the suit
 * (see suitGlyph / SUIT_AFFINITY) rather than stored per card.
 */

// ── Suit-derived presentation + draw affinity ───────────────────────────

const SUIT_GLYPH = {
  major: '✦',
  cups: '♥',
  pentacles: '◉',
  swords: '⚔',
  wands: '✸',
};

// How strongly each suit leans toward a life area. Used by the draw to bias
// (not force) which card lands on which category, so Cups gravitate to love,
// Pentacles to money/career, etc. Majors are balanced (they can land anywhere).
export const SUIT_AFFINITY = {
  major:     { love: 2, career: 2, money: 2, mood: 2 },
  cups:      { love: 4, career: 1, money: 1, mood: 3 },
  pentacles: { love: 1, career: 3, money: 4, mood: 1 },
  swords:    { love: 1, career: 3, money: 1, mood: 3 },
  wands:     { love: 2, career: 4, money: 1, mood: 2 },
};

export function suitGlyph(suit, arcana) {
  if (arcana === 'major') return SUIT_GLYPH.major;
  return SUIT_GLYPH[suit] || SUIT_GLYPH.major;
}

// ── Major Arcana (0-21) ─────────────────────────────────────────────────
// [number, name, upKeywords, downKeywords, upBlurb, downBlurb]

const MAJOR = [
  [0, 'The Fool', ['beginnings', 'leap of faith', 'freedom'], ['recklessness', 'hesitation', 'naivety'], 'A door opens; step through before you feel ready.', 'You are holding back from a leap you already know you want.'],
  [1, 'The Magician', ['willpower', 'manifestation', 'skill'], ['manipulation', 'untapped talent', 'doubt'], 'You have everything you need; act on it today.', 'A gift is going unused, or someone is not being straight with you.'],
  [2, 'The High Priestess', ['intuition', 'mystery', 'inner voice'], ['secrets', 'silence', 'ignored instinct'], 'The quiet knowing is right; trust it over the noise.', 'You are talking yourself out of what your gut already said.'],
  [3, 'The Empress', ['abundance', 'nurture', 'creation'], ['dependence', 'creative block', 'neglect'], 'Something you have tended is ready to bloom.', 'Tend to yourself first; you have been pouring from empty.'],
  [4, 'The Emperor', ['structure', 'authority', 'stability'], ['control', 'rigidity', 'stubbornness'], 'Order brings the freedom you have been craving.', 'A grip held too tight is the thing breaking it.'],
  [5, 'The Hierophant', ['tradition', 'guidance', 'belonging'], ['rebellion', 'unconvention', 'restriction'], 'An old answer or mentor holds today\'s key.', 'You are ready to leave a rule you have outgrown.'],
  [6, 'The Lovers', ['union', 'choice', 'alignment'], ['discord', 'misalignment', 'avoidance'], 'A choice of the heart asks you to be honest.', 'Two things you want pull against each other; name it.'],
  [7, 'The Chariot', ['drive', 'victory', 'control'], ['scattered', 'no direction', 'stalled'], 'Hold the reins; momentum is on your side.', 'You are pushing in two directions and moving in none.'],
  [8, 'Strength', ['courage', 'calm power', 'patience'], ['self-doubt', 'raw nerve', 'force'], 'Soft strength wins where force would fail.', 'The thing testing you is your own patience.'],
  [9, 'The Hermit', ['introspection', 'solitude', 'truth'], ['isolation', 'withdrawal', 'loneliness'], 'A step back reveals what the crowd was hiding.', 'Solitude tipped into hiding; let one person in.'],
  [10, 'Wheel of Fortune', ['change', 'luck', 'cycles'], ['resistance', 'bad timing', 'control'], 'A turn arrives unbidden; ride it, don\'t fight it.', 'You are resisting a cycle that has to turn anyway.'],
  [11, 'Justice', ['truth', 'fairness', 'consequence'], ['imbalance', 'evasion', 'unfairness'], 'A reckoning lands fairly; tell the truth and it favors you.', 'Something unbalanced is asking to be set right.'],
  [12, 'The Hanged Man', ['pause', 'surrender', 'new view'], ['stalling', 'indecision', 'delay'], 'Let go of forcing it; the answer comes upside-down.', 'The wait you resent is the lesson.'],
  [13, 'Death', ['ending', 'transformation', 'release'], ['clinging', 'stagnation', 'fear'], 'An ending clears the ground for what you actually want.', 'You are holding a corpse of something already gone.'],
  [14, 'Temperance', ['balance', 'patience', 'blend'], ['excess', 'imbalance', 'haste'], 'Mix the extremes; the middle path is the strong one.', 'Too much of one thing is tipping the day.'],
  [15, 'The Devil', ['attachment', 'temptation', 'shadow'], ['release', 'reclaiming', 'awareness'], 'A chain you call comfort is worth naming today.', 'You are closer to breaking free than you think.'],
  [16, 'The Tower', ['upheaval', 'revelation', 'sudden change'], ['fear of change', 'delay', 'averted'], 'What falls today needed to; truth clears in a flash.', 'You are bracing against a shift; let it land.'],
  [17, 'The Star', ['hope', 'renewal', 'faith'], ['despair', 'disconnection', 'doubt'], 'After the hard part, calm and a clear sky return.', 'Faith dimmed; one small light is enough to follow.'],
  [18, 'The Moon', ['illusion', 'intuition', 'the unknown'], ['clarity', 'truth surfacing', 'release'], 'Not everything is as it appears; feel your way.', 'A fog lifts and the real shape becomes visible.'],
  [19, 'The Sun', ['joy', 'clarity', 'success'], ['delay', 'dimmed', 'small cloud'], 'Warmth and a clear yes; let yourself be seen.', 'Happiness is here, just running a little late.'],
  [20, 'Judgement', ['awakening', 'reckoning', 'renewal'], ['self-doubt', 'avoidance', 'hesitation'], 'A call to rise; answer the thing you keep postponing.', 'You are judging yourself too hard to move.'],
  [21, 'The World', ['completion', 'wholeness', 'arrival'], ['loose ends', 'almost', 'unfinished'], 'A chapter closes well; you have arrived somewhere.', 'One last thread is keeping it from being done.'],
];

// ── Minor Arcana ────────────────────────────────────────────────────────
// Per suit: [number/court, name, upKeywords, downKeywords, upBlurb, downBlurb]

const CUPS = [
  [1, 'Ace of Cups', ['new feeling', 'love', 'opening'], ['blocked emotion', 'emptiness', 'guarded'], 'A feeling opens like a tap; let it flow.', 'Something is dammed up; you are holding it in.'],
  [2, 'Two of Cups', ['attraction', 'partnership', 'mutuality'], ['imbalance', 'rupture', 'tension'], 'A real connection meets you halfway.', 'A bond is one-sided; even it out or name it.'],
  [3, 'Three of Cups', ['friendship', 'celebration', 'belonging'], ['overindulgence', 'gossip', 'drift'], 'Your people show up; let yourself be carried.', 'A circle feels off; watch what is said behind backs.'],
  [4, 'Four of Cups', ['apathy', 'contemplation', 'missed gift'], ['new awareness', 'acceptance', 'opening'], 'An offer is in front of you while you stare away.', 'You are finally ready to look up and take it.'],
  [5, 'Five of Cups', ['loss', 'regret', 'grief'], ['acceptance', 'moving on', 'recovery'], 'Grieve what spilled, but two cups still stand.', 'You are turning from the loss toward what remains.'],
  [6, 'Six of Cups', ['nostalgia', 'memory', 'innocence'], ['stuck in past', 'leaving home', 'idealizing'], 'The past sends a soft, kind message today.', 'A memory is keeping you from the present.'],
  [7, 'Seven of Cups', ['choices', 'fantasy', 'illusion'], ['clarity', 'decision', 'focus'], 'Many options shimmer; not all are real.', 'The fog clears and one choice becomes obvious.'],
  [8, 'Eight of Cups', ['walking away', 'seeking', 'meaning'], ['fear of change', 'drifting', 'avoidance'], 'You leave what is fine to find what is true.', 'You keep circling an exit you will not take.'],
  [9, 'Nine of Cups', ['contentment', 'wish', 'satisfaction'], ['smugness', 'unmet wish', 'excess'], 'A wish comes good; enjoy it without apology.', 'Satisfaction on the surface, hunger underneath.'],
  [10, 'Ten of Cups', ['harmony', 'lasting joy', 'family'], ['broken bond', 'misalignment', 'strain'], 'The full picture of belonging is within reach.', 'A bond looks whole but feels off; tend it.'],
  ['page', 'Page of Cups', ['curiosity', 'tender news', 'wonder'], ['immaturity', 'moodiness', 'escapism'], 'A sweet, unexpected message arrives.', 'A feeling is too tender to handle roughly today.'],
  ['knight', 'Knight of Cups', ['romance', 'charm', 'heart-led'], ['unrealistic', 'moodiness', 'inconstant'], 'Follow the heart; an invitation is sincere.', 'A charming offer may not hold its shape.'],
  ['queen', 'Queen of Cups', ['compassion', 'security', 'intuition'], ['dependence', 'insecurity', 'overwhelm'], 'Lead with warmth; your read on people is true.', 'You are absorbing feelings that are not yours.'],
  ['king', 'King of Cups', ['emotional balance', 'calm', 'diplomacy'], ['manipulation', 'moodiness', 'withdrawal'], 'Steady warmth steadies the room.', 'A calm front hides a current pulling sideways.'],
];

const PENTACLES = [
  [1, 'Ace of Pentacles', ['opportunity', 'prosperity', 'seed'], ['missed chance', 'scarcity', 'delay'], 'A solid opportunity lands in your hands.', 'A door is there but the timing feels thin.'],
  [2, 'Two of Pentacles', ['balance', 'juggling', 'flexibility'], ['overwhelm', 'disorder', 'dropped ball'], 'You keep two things in the air with surprising ease.', 'One ball too many; something is about to drop.'],
  [3, 'Three of Pentacles', ['teamwork', 'skill', 'building'], ['discord', 'poor work', 'solo'], 'Collaboration makes the work better than solo.', 'Effort is misaligned; the parts do not fit.'],
  [4, 'Four of Pentacles', ['security', 'saving', 'control'], ['greed', 'clinging', 'fear'], 'Hold what matters; structure protects you now.', 'A grip on money or control is squeezing too hard.'],
  [5, 'Five of Pentacles', ['hardship', 'insecurity', 'cold'], ['recovery', 'help arrives', 'turning point'], 'A lean stretch; warmth is closer than it looks.', 'Help is at the door you keep walking past.'],
  [6, 'Six of Pentacles', ['generosity', 'fairness', 'flow'], ['strings attached', 'inequality', 'debt'], 'Giving and receiving balance out today.', 'A gift has strings; check the real terms.'],
  [7, 'Seven of Pentacles', ['patience', 'long view', 'assessment'], ['impatience', 'poor return', 'doubt'], 'Let what you planted keep growing; do not dig it up.', 'You want the harvest before the season is done.'],
  [8, 'Eight of Pentacles', ['diligence', 'mastery', 'craft'], ['perfectionism', 'no growth', 'rote'], 'Heads-down work compounds into real skill.', 'Effort without aim; refine the target, not just the grind.'],
  [9, 'Nine of Pentacles', ['self-sufficiency', 'reward', 'comfort'], ['overwork', 'dependence', 'showy'], 'You can rest in what you built alone.', 'Comfort bought with too many hours; recalibrate.'],
  [10, 'Ten of Pentacles', ['wealth', 'legacy', 'stability'], ['fleeting', 'family friction', 'risk'], 'Lasting stability; the long game pays.', 'Security looks set but a foundation needs checking.'],
  ['page', 'Page of Pentacles', ['ambition', 'study', 'new venture'], ['procrastination', 'missed news', 'unfocused'], 'A practical new beginning rewards the curious.', 'A plan stalls in the thinking stage; start small.'],
  ['knight', 'Knight of Pentacles', ['diligence', 'routine', 'reliability'], ['boredom', 'stagnation', 'stubborn'], 'Slow and steady wins this one cleanly.', 'Routine curdled into rut; change one thing.'],
  ['queen', 'Queen of Pentacles', ['practical care', 'resourceful', 'grounded'], ['smothering', 'imbalance', 'self-neglect'], 'Nurture and pragmatism make you the steady one.', 'You are caring for everything but yourself.'],
  ['king', 'King of Pentacles', ['abundance', 'security', 'leadership'], ['greed', 'materialism', 'control'], 'Discipline turns into real, durable abundance.', 'Counting it all but enjoying none of it.'],
];

const SWORDS = [
  [1, 'Ace of Swords', ['clarity', 'breakthrough', 'truth'], ['confusion', 'misused force', 'fog'], 'A clean insight cuts the knot today.', 'Sharp words or a sharp idea aimed the wrong way.'],
  [2, 'Two of Swords', ['stalemate', 'hard choice', 'avoidance'], ['decision', 'overwhelm', 'release'], 'A choice is balanced on a blade; take the blindfold off.', 'The deadlock breaks; you finally pick a side.'],
  [3, 'Three of Swords', ['heartbreak', 'painful truth', 'release'], ['recovery', 'forgiveness', 'healing'], 'A truth stings, but naming it starts the mending.', 'You are setting down a hurt you carried too long.'],
  [4, 'Four of Swords', ['rest', 'recovery', 'pause'], ['restlessness', 'burnout', 'stagnation'], 'Stop. The strongest move today is rest.', 'You are running on fumes and calling it discipline.'],
  [5, 'Five of Swords', ['conflict', 'winning at cost', 'tension'], ['reconciliation', 'release', 'amends'], 'A win today may cost more than it gives.', 'Time to put down the grudge and reconcile.'],
  [6, 'Six of Swords', ['transition', 'moving on', 'calmer water'], ['stuck', 'unfinished', 'baggage'], 'You move toward calmer water; the worst is behind.', 'You keep packing the same baggage onto the boat.'],
  [7, 'Seven of Swords', ['strategy', 'stealth', 'acting alone'], ['coming clean', 'conscience', 'exposure'], 'A clever move works, but keep it honest.', 'Something hidden wants to come into the open.'],
  [8, 'Eight of Swords', ['restriction', 'self-limit', 'stuck'], ['release', 'new view', 'freedom'], 'The cage door is open; the bind is in your head.', 'You are talking yourself out of a trap you can leave.'],
  [9, 'Nine of Swords', ['anxiety', 'worry', 'sleepless'], ['hope returns', 'facing fear', 'relief'], 'The 3am fears are louder than they are true.', 'Daylight shrinks the worry; name it and it loosens.'],
  [10, 'Ten of Swords', ['painful end', 'rock bottom', 'release'], ['recovery', 'rising', 'survival'], 'A hard ending; it cannot get worse from here.', 'You survived it; the only direction now is up.'],
  ['page', 'Page of Swords', ['curiosity', 'vigilance', 'news'], ['scattered', 'gossip', 'haste'], 'Stay sharp; useful news travels fast today.', 'Half-formed ideas and chatter; verify before you act.'],
  ['knight', 'Knight of Swords', ['drive', 'fast action', 'ambition'], ['recklessness', 'aggression', 'haste'], 'Charge the thing; speed is your edge now.', 'Slow down; force will overshoot the target.'],
  ['queen', 'Queen of Swords', ['clear honesty', 'independence', 'wit'], ['coldness', 'harsh words', 'bitterness'], 'Clear eyes and a clean boundary serve you.', 'Honesty hardened into cold; soften the edge.'],
  ['king', 'King of Swords', ['authority', 'truth', 'intellect'], ['misused power', 'manipulation', 'cold logic'], 'Lead with truth and clear judgment.', 'Logic without heart is making a bad call.'],
];

const WANDS = [
  [1, 'Ace of Wands', ['inspiration', 'spark', 'new venture'], ['delay', 'no direction', 'flat'], 'A spark of want; light it before it fades.', 'The fire is there but the kindling is wet.'],
  [2, 'Two of Wands', ['planning', 'vision', 'choice'], ['fear of change', 'playing safe', 'stuck'], 'Map the bigger move; the world is wider than this room.', 'You are choosing safe over the thing you actually want.'],
  [3, 'Three of Wands', ['expansion', 'foresight', 'progress'], ['delay', 'obstacle', 'short view'], 'Ships are coming in; your reach is paying off.', 'A delay tests your patience, not your plan.'],
  [4, 'Four of Wands', ['celebration', 'home', 'milestone'], ['instability', 'transition', 'tension'], 'A milestone worth marking; let it land.', 'Foundations feel shaky mid-move; steady them.'],
  [5, 'Five of Wands', ['competition', 'friction', 'tension'], ['avoidance', 'resolution', 'truce'], 'Some friction sharpens you; engage it cleanly.', 'A pointless clash; step out of the scrum.'],
  [6, 'Six of Wands', ['victory', 'recognition', 'momentum'], ['setback', 'no credit', 'doubt'], 'You get the win and the credit; take the lap.', 'Recognition lags the work; keep going anyway.'],
  [7, 'Seven of Wands', ['defense', 'perseverance', 'stand'], ['overwhelm', 'giving up', 'exposed'], 'Hold your ground; your position is stronger than it feels.', 'You are defending something not worth the fight.'],
  [8, 'Eight of Wands', ['speed', 'movement', 'news'], ['delay', 'frustration', 'scattered'], 'Things move fast now; reply quickly, ride it.', 'A held-up message or plan finally breaks loose, or jams.'],
  [9, 'Nine of Wands', ['resilience', 'persistence', 'last push'], ['exhaustion', 'defensive', 'paranoia'], 'One more push; you are closer than the ache says.', 'Worn down and wary; rest before the last round.'],
  [10, 'Ten of Wands', ['burden', 'responsibility', 'overload'], ['release', 'delegation', 'letting go'], 'You can carry it, but should you carry all of it?', 'Put some bundles down; you do not have to hold it alone.'],
  ['page', 'Page of Wands', ['exploration', 'excitement', 'spark'], ['hesitation', 'bad news', 'restless'], 'A bright idea wants you to chase it.', 'Enthusiasm without footing; pick a direction.'],
  ['knight', 'Knight of Wands', ['adventure', 'energy', 'passion'], ['impulsive', 'scattered', 'reckless'], 'Bold energy opens a door; move with it.', 'All gas, no map; channel the fire.'],
  ['queen', 'Queen of Wands', ['confidence', 'warmth', 'magnetism'], ['jealousy', 'insecurity', 'demanding'], 'Your warmth draws the right people in.', 'Insecurity dimming a light that should be on.'],
  ['king', 'King of Wands', ['vision', 'leadership', 'boldness'], ['impulsive', 'domineering', 'overreach'], 'Lead from vision; people follow conviction.', 'Boldness tipping into bulldozing; ease off.'],
];

// ── Normalize into a single deck array ──────────────────────────────────

function makeCard(arcana, suit, [num, name, up, down, upBlurb, downBlurb]) {
  const isCourt = typeof num === 'string';
  const number = isCourt ? null : num;
  const idSuit = arcana === 'major' ? 'maj' : suit.slice(0, 3);
  const idNum = isCourt ? num : String(num).padStart(2, '0');
  return {
    id: `${idSuit}_${idNum}`,
    name,
    arcana,
    suit: arcana === 'major' ? null : suit,
    number,
    court: isCourt ? num : null,
    glyph: suitGlyph(suit, arcana),
    keywordsUpright: up,
    keywordsReversed: down,
    blurbUpright: upBlurb,
    blurbReversed: downBlurb,
  };
}

export const TAROT_DECK = [
  ...MAJOR.map((t) => makeCard('major', 'major', t)),
  ...CUPS.map((t) => makeCard('minor', 'cups', t)),
  ...PENTACLES.map((t) => makeCard('minor', 'pentacles', t)),
  ...SWORDS.map((t) => makeCard('minor', 'swords', t)),
  ...WANDS.map((t) => makeCard('minor', 'wands', t)),
];

const BY_ID = TAROT_DECK.reduce((acc, card) => {
  acc[card.id] = card;
  return acc;
}, {});

export function getCardById(id) {
  return BY_ID[id] || null;
}

/** Returns the canonical reading for a card + orientation. */
export function cardMeaning(card, orientation = 'upright') {
  if (!card) return null;
  const reversed = orientation === 'reversed';
  return {
    surface: reversed ? card.blurbReversed : card.blurbUpright,
    keywords: reversed ? card.keywordsReversed : card.keywordsUpright,
  };
}

/** Human label like "Two of Cups · Reversed" / "The Tower". */
export function cardLabel(card, orientation = 'upright') {
  if (!card) return '';
  return orientation === 'reversed' ? `${card.name} · Reversed` : card.name;
}

export const TAROT_DECK_SIZE = TAROT_DECK.length; // 78
