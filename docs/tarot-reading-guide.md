# Tarot Reading Guide (WWHT)

This is the single source of truth for how a drawn card becomes a daily reading in
**What Will Happen Today**. It is written for two readers: the LLM that generates
nightly readings (card-aware), and the humans who edit copy and tune the voice.

The reading text NEVER quotes the card name or the words "upright"/"reversed" — the
non-LLM tarot block already prints `cardName · orientation · glyph` above the prose.
Your job is to render the *thing the card points at*, as an event that WILL happen.

---

## 1. The four life areas

Every reading is filed under one of four areas. The whole app is built around them:

| Area    | Code | Covers |
|---------|------|--------|
| Love    | `L`  | relationships, attraction, communication, emotional dynamics, connection |
| Career  | `C`  | work, focus, opportunity, visibility, momentum, professional dynamics |
| Money   | `M`  | spending, earning, financial decisions, value, resources |
| Mood    | `D`  | mental state, energy, emotional weather, resilience, inner clarity |

`id` is prefixed by the area letter (L/C/M/D) + a zero-padded number, e.g. `L042`.
The id is housekeeping only (caching / recent-id rotation) — it is never card-derived.

Mood is the cross-cutting area: it is touched by feeling (Cups), by the mind
(Swords), and by energy (Wands). Keep this in mind when a non-Cups card lands on Mood.

---

## 2. Suit -> element -> life-area map

Each Minor suit is governed by a classical element, and the element's *nature* is the
reason it leans toward a life area. The Major Arcana sit above the elements: they are
archetypes, the soul's overarching journey, so they can land anywhere.

| Suit       | Element                | Primary area | Secondary area | Why |
|------------|------------------------|--------------|----------------|-----|
| Cups       | Water                  | **Love**     | Mood           | Flow, feeling, intuition — the emotional and relational self. Water flows, floods, or is blocked, exactly like moods. |
| Pentacles  | Earth (Coins/Disks)    | **Money**    | Career         | Tangible, weighty, real — finances, the body, resources, the material fruit of work. |
| Swords     | Air                    | **Mood** (mental) | Career    | The mind — thought, logic, conflict, decisions. Clarity *and* worry/overthinking; strategy and tough calls. |
| Wands      | Fire                   | **Career**   | Mood (energy)  | Passion, drive, willpower, the spark — the engine of work and ambition; its high/low energy colors motivation. |
| Major      | Archetypes (no element)| balanced     | (slight mood lean) | The big turn — a spiritual lesson that transcends the four suits. |

The two cleanest single mappings are **Cups -> Love** and **Pentacles -> Money**.
Career is split between Wands (drive) and Pentacles (material results), with Swords
adding decisions/conflict. Mood is shared across Cups (feeling), Swords (the head),
and Wands (energy).

### Draw affinity weights

The draw uses integer weights 1-4 per suit per area to *bias* (not force) which card
lands on which category. These are tuned to the verified per-suit averages while
keeping the elemental story legible:

```js
export const SUIT_AFFINITY = {
  major:     { love: 2, career: 2, money: 2, mood: 3 },
  cups:      { love: 4, career: 2, money: 1, mood: 3 },
  pentacles: { love: 1, career: 3, money: 4, mood: 2 },
  swords:    { love: 1, career: 3, money: 1, mood: 4 },
  wands:     { love: 2, career: 4, money: 1, mood: 3 },
};
```

These are draw biases only — once a card is on a category, the reading is written to
that category regardless of suit. A Swords card on Love still reads as Love.

---

## 3. Ace–Ten numerology

The number tells you the *stage* of the suit's story. Combine number-stage with the
suit's life-area to find the omen.

| # | Stage | Texture |
|---|-------|---------|
| Ace | seed / pure potential | a new thing offered, raw and whole |
| 2 | choice / pairing | balance, a decision, a meeting of two |
| 3 | first growth / others | collaboration, early result, a circle |
| 4 | structure / pause | stability, holding, a plateau (can stagnate) |
| 5 | conflict / loss | friction, lack, the hard middle |
| 6 | harmony / movement | recovery, giving-receiving, transition |
| 7 | assessment / illusion | patience, strategy, choices, the mirage |
| 8 | mastery / momentum | speed, craft, repetition, or restriction |
| 9 | near-completion | the last stretch, a wish, the 3am worry |
| 10 | completion / overload | the full picture, the burden, the ending |

Tempo from the number guides `timing`: low numbers = early/sudden, high numbers =
the long arc landing late.

---

## 4. The court cards

Courts are people or modes of being — usually someone in the reader's day, or a
posture they are asked to take. Read the suit for the arena, the rank for the energy:

| Rank | Energy |
|------|--------|
| Page | a message, news, a beginner's curiosity, something young |
| Knight | action in motion — pursuit, speed, drive (can overshoot) |
| Queen | inward mastery — care, intuition, steadiness, depth |
| King | outward mastery — authority, command, the seasoned hand |

A court card often predicts a *who*: "Someone steady will…", "A message will arrive…".

---

## 5. Reversal philosophy

Reversed is not "the opposite" and never "bad luck." It is the **blocked, withheld,
internal, delayed, or about-to-break** version of the same card. The energy is present
but not flowing outward yet.

- **Upright** = the event arrives, lands, or is offered. It happens *to* or *around*
  the reader (outward). Keep the lift.
- **Reversed** = the friction, the holding-back, the not-yet-said, the dam about to
  give. It happens *inside* the reader, or arrives late. Keep the sting.

Examples: The Sun upright -> "Someone will see you clearly and say so." The Sun
reversed -> "You'll feel the good thing arriving late, and almost miss it." The Devil
reversed is *closer to breaking free* than bound. Reversed Five of Cups turns *toward*
what remains.

The prose must NEVER use the word "reversed" or "upright" — the orientation is already
shown in the tarot block. You express it only through the emotional vector (arriving
vs. blocked).

---

## 6. How a card maps onto each WWHT field

A reading has a fixed three-beat cadence laid over the JSON fields. Card name +
orientation + glyph are printed by the app FIRST (the tarot block); then the prose:

> teaser -> full -> punch -> timing -> action  (shareSnippet sits behind the share button)

**BEAT 1 — NAME WHAT THE CARD SHOWS (the omen)**

- `teaser` — the card's core keyword rendered as ONE predicted event today. <=16 words.
  Open with **You will / You'll / You'll notice / Someone will / A [noun] will**.
  Present/near-future. UPRIGHT: the event arrives/lands/is offered. REVERSED: the
  blocked/internal/late version. Match the suit texture (Cups = feeling, Pentacles =
  money/work, Swords = words/truth/conflict, Wands = drive/momentum, Major = a larger
  turn). **Never print the card name.**

**BEAT 2 — WHAT IT MEANS FOR TODAY (the read)**

- `full` — 2-3 short thought-like lines, `\n`-separated. Internal, specific, the
  texture and the tell — the moment the omen shows up in the actual day. UPRIGHT:
  describe the event and its tell. REVERSED: describe the friction / the thing not yet
  said / the dam about to give. Stay concrete (a reply that comes late, a number that
  doesn't add up, a look that doesn't land).
- `punch` — ONE sharp, screenshot-worthy line: the uncomfortable truth the `full` was
  orbiting. <=14 words. UPRIGHT still gets a punch (the cost/catch inside the good
  news). REVERSED punches the avoidance ("You already know. You're just not ready to
  say it."). No hedging, no comfort-padding.
- `timing` — an EXPERIENTIAL time anchor, <=12 words. A felt moment, not a clock time
  ("It surfaces in the first real conversation today.", "before you sleep"). Lean on
  the card's tempo: Tower/Wands/Aces = sudden/early; Hanged Man/Hermit/high numbers/
  reversed = slow, late, in the quiet, "in an unguarded moment."

**BEAT 3 — WHAT TO DO WHEN IT LANDS (the instruction)**

- `action` — ONE direct imperative for the MOMENT it arrives, <=18 words. UPRIGHT: how
  to receive/use it ("Say yes before you talk yourself out of it."). REVERSED: how to
  unblock it ("Name the one thing you've been routing around. Out loud."). Specific to
  the predicted moment, never generic self-care.

**Parallel to Beat 1**

- `shareSnippet` — a self-contained, app-name-free retelling of the teaser (usually
  teaser + the punch's twist, compressed). <=18 words. Must make sense out of context,
  like a screenshot someone posts about their own day. UPRIGHT keeps the lift,
  REVERSED keeps the sting.

The seven text fields must stay CONSISTENT with the day's card + orientation +
keywords — same card, same direction, same emotional vector — but must never quote the
name or the orientation words.

---

## 7. Voice rules

**Voice:** intimate, certain, a little unsettling — a reader who already knows what
happens and is *telling* you, not guessing with you. Warm but unflinching. The
discomfort comes from accuracy, not cruelty: name the gap between what someone shows
and what they feel.

- **Address:** second person, present/near-future. Open predictive lines with "You
  will", "You'll", "You'll notice", "Someone will", or "A [thing] will". State events
  as facts that WILL occur.
- **Banned hedges:** never *may, might, could, tends to, perhaps, sometimes, often, a
  chance that*. Certainty is the product.
- **Banned mysticism / no astrology-cringe:** never *the universe, energy, vibrations,
  frequencies, manifest, aura, planets, Mercury, retrograde, zodiac, sign, the cosmos,
  alignment of the stars*. The reading is psychological and concrete, not celestial.
- **No deck mechanics in prose:** never *this card, the spread, reversed, upright,
  drawn, the deck, shuffle*. (This also protects the monetization model — the reading
  never references drawing/redrawing.)
- **Register:** plain, sharp, grounded, a little literary. Short declaratives. One
  image landed cleanly beats three adjectives. Slightly mysterious, never woo.
- **No** emojis, hashtags, exclamation marks, em/en dashes, or the app name in any
  field.

---

## 8. Two fully worked examples

### Example A — UPRIGHT

**Card (tarot block, not generated):** Two of Cups · Upright · ♥
Suit: Cups (Water). Number: 2 (choice / pairing). Keywords: attraction, partnership,
mutuality. Surface: "A real connection meets you halfway." Area: Love.

```json
{
  "id": "L087",
  "teaser": "Someone will close half the distance today, and mean it.",
  "full": "A look or a line will land softer than the usual back-and-forth.\nYou'll feel the pull to match it, and the older pull to stay safe.\nThe meeting point is closer than you keep insisting.",
  "punch": "You're calling it caution. It's just the fear of being met.",
  "action": "When they step toward you, step back the same amount. Don't perform indifference.",
  "timing": "It surfaces in the first warm exchange of the day.",
  "shareSnippet": "Someone will close half the distance today and mean it. You'll call your hesitation caution."
}
```

### Example B — REVERSED

**Card (tarot block, not generated):** Three of Swords · Reversed · ⚔
Suit: Swords (Air). Number: 3 (first growth / others, here: heartbreak). Keywords:
recovery, forgiveness, healing. Surface: "You are setting down a hurt you carried too
long." Area: Mood.

```json
{
  "id": "D131",
  "teaser": "You'll notice a familiar ache has quietly lost some of its weight.",
  "full": "The thing that used to flatten you will come up today and not flatten you.\nYou'll test it, almost disappointed it doesn't hurt the way it did.\nThe grip is loosening whether you're ready to admit it or not.",
  "punch": "You kept the wound open because healing meant it was really over.",
  "action": "When the old story replays, let it finish. Don't restart it from the top.",
  "timing": "You'll feel it in a quiet moment before you sleep.",
  "shareSnippet": "An old ache will lose its weight today. You kept it open because letting go meant it was really over."
}
```

Note how neither example names the card, says "reversed/upright," or uses any banned
word; both state events as facts, carry the suit texture, and land one clean image.