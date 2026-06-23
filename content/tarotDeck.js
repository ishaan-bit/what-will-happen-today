/**
 * The Deck — a full 78-card Rider-Waite tarot deck with concise, accurate
 * upright/reversed meanings.
 *
 * Meanings are canonical Rider-Waite-Smith, researched + cross-checked against
 * multiple reputable references (Biddy Tarot, Labyrinthos, et al.), 2026-06.
 * See docs/tarot-reading-guide.md.
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
  major:     { love: 2, career: 2, money: 2, mood: 3 },
  cups:      { love: 4, career: 2, money: 1, mood: 3 },
  pentacles: { love: 1, career: 3, money: 4, mood: 2 },
  swords:    { love: 1, career: 3, money: 1, mood: 4 },
  wands:     { love: 2, career: 4, money: 1, mood: 3 },
};

export function suitGlyph(suit, arcana) {
  if (arcana === 'major') return SUIT_GLYPH.major;
  return SUIT_GLYPH[suit] || SUIT_GLYPH.major;
}

// ── Major Arcana (0-21) ─────────────────────────────────────────────────
// [number, name, upKeywords, downKeywords, upBlurb, downBlurb]

const MAJOR = [
  [0, "The Fool", ["new beginnings","innocence","free spirit"], ["recklessness","holding back","naivety"], "You'll step off a ledge today; trust the leap before you can see the ground.", "Look before you leap; a careless step today costs more than it should."],
  [1, "The Magician", ["manifestation","willpower","resourcefulness"], ["manipulation","poor planning","untapped talent"], "Everything you need is already in your hands; act and it becomes real.", "Someone's smooth talk hides empty hands; check what's real before you commit."],
  [2, "The High Priestess", ["intuition","mystery","inner voice"], ["secrets","silenced intuition","withdrawal"], "You already know the answer; go quiet and let it surface.", "A secret is being kept from you, or by you; the quiet is hiding something."],
  [3, "The Empress", ["abundance","nurturing","creativity"], ["creative block","dependence","smothering"], "Something you've tended is ready to bloom; receive it without guilt.", "You're pouring into everyone but yourself; the well is running dry today."],
  [4, "The Emperor", ["authority","structure","stability"], ["control","rigidity","domination"], "Set the rule and hold the line; today rewards the one who takes charge.", "Someone's grip is too tight today; rigid control will crack what it holds."],
  [5, "The Hierophant", ["tradition","guidance","belonging"], ["rebellion","questioning","nonconformity"], "Follow the tried path or seek a mentor; the old way works today.", "You'll break a rule everyone obeys; the old way no longer fits you."],
  [6, "The Lovers", ["union","alignment","choice"], ["disharmony","imbalance","misalignment"], "A real choice arrives today; pick what your whole heart can stand behind.", "Something's out of step between you two; you both want different things now."],
  [7, "The Chariot", ["willpower","determination","victory"], ["no direction","lost control","scattered"], "Grip the reins and drive; sheer will carries you through today.", "You're pulling in two directions; pick one road before you stall out."],
  [8, "Strength", ["courage","patience","gentle power"], ["self-doubt","low energy","raw emotion"], "You'll tame something fierce today not by force but by staying calm.", "Your patience is thin today; the gentlest move is the one you keep skipping."],
  [9, "The Hermit", ["introspection","solitude","inner guidance"], ["isolation","loneliness","withdrawal"], "Step back from the noise today; the answer is found alone, not asked for.", "You've pulled away too far; solitude has curdled into something lonely."],
  [10, "Wheel of Fortune", ["turning point","destiny","change"], ["bad luck","resistance","stuck cycle"], "The wheel turns in your favor today; what was stuck suddenly moves.", "Luck slips the wrong way today; stop fighting the turn and ride it out."],
  [11, "Justice", ["fairness","truth","accountability"], ["unfairness","dishonesty","evasion"], "What you set in motion comes back today; the truth gets weighed exactly.", "Something unfair is being dodged today; someone won't own what they did."],
  [12, "The Hanged Man", ["surrender","new perspective","pause"], ["stalling","resistance","indecision"], "Stop pushing and hang still; today the answer comes from a different angle.", "You're stuck mid-air today; a sacrifice you keep refusing is the way down."],
  [13, "Death", ["endings","transformation","release"], ["resistance","stagnation","holding on"], "Something ends today so the rest can live; let it go without flinching.", "You're clinging to what's already over; the rot spreads until you release it."],
  [14, "Temperance", ["balance","moderation","patience"], ["excess","imbalance","impatience"], "Mix it slow and steady today; the right blend asks for patience, not force.", "You're running to extremes today; one part of your life is starving another."],
  [15, "The Devil", ["attachment","temptation","restriction"], ["release","breaking free","reclaiming power"], "You'll feel the pull of a habit that holds you; the chains are looser than they look.", "You'll loosen a grip that owned you; what controlled you starts to let go."],
  [16, "The Tower", ["sudden change","upheaval","revelation"], ["averted disaster","fear of change","delayed fall"], "What falls today needed to; the truth clears in a single flash.", "You'll dodge the crash today, but the cracks you're hiding are still there."],
  [17, "The Star", ["hope","renewal","faith"], ["despair","lost faith","discouragement"], "After the wreckage, calm returns today; quiet hope is allowed to grow again.", "Faith feels far today; the light is still there even when you can't feel it."],
  [18, "The Moon", ["illusion","fear","the unknown"], ["clarity","released fear","confusion lifting"], "Not everything is what it seems today; let your fear talk but don't obey it.", "A fog finally lifts today; what scared you in the dark loses its grip."],
  [19, "The Sun", ["joy","vitality","success"], ["dimmed joy","overoptimism","feeling down"], "Something simply goes right today; let yourself enjoy it out loud.", "The good news is real but feels faint today; the warmth is taking its time."],
  [20, "Judgement", ["reckoning","awakening","rebirth"], ["self-doubt","inner critic","ignored calling"], "A call comes today you can't unhear; answer it and become who's next.", "You'll judge yourself too harshly today; the call is still yours to answer."],
  [21, "The World", ["completion","achievement","wholeness"], ["incompletion","loose ends","delays"], "A long chapter closes today; stand still long enough to feel it finish.", "You're one step from done; a loose end is keeping the circle from closing."],
];

// ── Minor Arcana ────────────────────────────────────────────────────────
// Per suit: [number/court, name, upKeywords, downKeywords, upBlurb, downBlurb]

const CUPS = [
  [1, "Ace of Cups", ["new love","compassion","creativity"], ["repressed emotions","self-love","blocked feeling"], "A cup overflows toward you today; let yourself feel something new.", "You will swallow a feeling you should have spoken; it leaks anyway."],
  [2, "Two of Cups", ["partnership","attraction","connection"], ["disharmony","breakup","distrust"], "Someone will meet your eyes and mean it; a true equal arrives.", "A bond tilts off balance today; one of you is giving far more."],
  [3, "Three of Cups", ["celebration","friendship","community"], ["isolation","gossip","overindulgence"], "Your people gather close today; raise a glass and let it be joyful.", "You'll feel left outside the circle today; a third person crowds the room."],
  [4, "Four of Cups", ["apathy","contemplation","discontent"], ["new awareness","acceptance","re-engaging"], "You'll overlook a gift held out to you because you're busy sulking.", "You will finally look up; the offer you ignored is still waiting."],
  [5, "Five of Cups", ["loss","regret","grief"], ["acceptance","forgiveness","moving on"], "You'll stare at what spilled today; two cups still stand behind you.", "You are setting down an old grief; turn around, something remains."],
  [6, "Six of Cups", ["nostalgia","innocence","happy memories"], ["stuck in past","letting go","growing up"], "Someone from before will resurface today; it tastes like being young.", "You'll catch yourself living backward; the past has nothing left to give."],
  [7, "Seven of Cups", ["choices","illusion","wishful thinking"], ["clarity","decision","values"], "Too many shiny options today; most are smoke. Choose the real one.", "The fog lifts today; you finally see which cup is real and reach for it."],
  [8, "Eight of Cups", ["walking away","withdrawal","seeking more"], ["aimless drifting","fear of leaving","indecision"], "You'll quietly leave what no longer fills you; the road out feels right.", "You will linger where you've outgrown the room; too scared to take step one."],
  [9, "Nine of Cups", ["contentment","satisfaction","wish granted"], ["dissatisfaction","indulgence","smugness"], "A wish quietly comes true today; sit back and let yourself be pleased.", "You'll get what you wanted and still feel hollow; it wasn't the real wish."],
  [10, "Ten of Cups", ["harmony","happy family","fulfillment"], ["broken home","misalignment","strained ties"], "Home feels whole today; the people you love are gathered and safe.", "The picture-perfect cracks today; a closeness you assumed is strained."],
  ["page", "Page of Cups", ["new feeling","intuition","creativity"], ["emotional immaturity","doubt","creative block"], "A small sweet surprise arrives today; trust the odd hunch you get.", "You'll act from a sulk today; a feeling too young to handle the moment."],
  ["knight", "Knight of Cups", ["romance","charm","following the heart"], ["moodiness","unrealistic","disappointment"], "An invitation arrives with charm today; someone is coming to woo you.", "A sweet promise won't hold today; the romance is mostly daydream."],
  ["queen", "Queen of Cups", ["compassion","intuition","emotional calm"], ["overwhelm","insecurity","dependence"], "Lead with your heart today; your read on people is unusually true.", "You'll absorb too much of others today; set your feelings down first."],
  ["king", "King of Cups", ["emotional balance","compassion","diplomacy"], ["moodiness","manipulation","coldness"], "Stay calm in the storm today; steady kindness settles everyone around you.", "Someone will use feelings as a weapon today; do not be moved by it."],
];

const PENTACLES = [
  [1, "Ace of Pentacles", ["opportunity","prosperity","new venture"], ["lost opportunity","bad investment","poor planning"], "A solid offer lands in your hands today; take it before it cools.", "An opening slips past while you hesitate; plan before you reach again."],
  [2, "Two of Pentacles", ["balance","prioritisation","adaptability"], ["overwhelmed","disorganised","dropped ball"], "You'll juggle more than feels safe today, and somehow keep both in the air.", "You are spread too thin; something will drop unless you choose now."],
  [3, "Three of Pentacles", ["teamwork","collaboration","skill"], ["disharmony","working alone","misalignment"], "Your work gets noticed today; build it with others, not despite them.", "You're carrying the team alone; the cracks will show before the praise does."],
  [4, "Four of Pentacles", ["security","saving","control"], ["letting go","generosity","over-spending"], "You'll hold tight to what you have today; just notice your knuckles are white.", "Your grip is the problem now; loosen it before it costs you the person."],
  [5, "Five of Pentacles", ["hardship","isolation","worry"], ["recovery","charity","improvement"], "You'll feel left out in the cold today; the door you need is right behind you.", "The worst is passing; accept the help you almost walked past."],
  [6, "Six of Pentacles", ["generosity","sharing","receiving"], ["strings attached","debt","one-sided giving"], "Money or help moves between hands today; give freely or take it gracefully.", "A gift comes with a hook; weigh what they'll quietly ask in return."],
  [7, "Seven of Pentacles", ["patience","perseverance","long view"], ["no results","impatience","wasted effort"], "Today you wait, not quit; what you planted needs one more season.", "You're watering dead ground; admit it before you sink another month in."],
  [8, "Eight of Pentacles", ["mastery","diligence","skill development"], ["perfectionism","no motivation","uninspired"], "Head down today; the repetition you resent is quietly making you good.", "You're polishing the wrong thing; the effort is real, the aim is off."],
  [9, "Nine of Pentacles", ["abundance","self-sufficiency","luxury"], ["overwork","false success","shaky worth"], "You'll enjoy what you built alone today; you earned every bit of this calm.", "The shine is borrowed; you're spending peace you don't actually have yet."],
  [10, "Ten of Pentacles", ["legacy","wealth","family"], ["instability","fleeting success","family strain"], "Something you build today outlasts you; the family table feels secure.", "The foundation is thinner than it looks; an old money tie will pull tight."],
  ["page", "Page of Pentacles", ["ambition","new skill","diligence"], ["procrastination","no progress","missed lesson"], "A small ambition takes root today; start the boring first step now.", "You keep meaning to begin; the delay is becoming the real problem."],
  ["knight", "Knight of Pentacles", ["hard work","routine","responsibility"], ["stuck","boredom","stagnation"], "Slow and steady wins today; the dull, reliable choice is the right one.", "The routine has gone stale; you're calling stuck-ness 'being responsible.'"],
  ["queen", "Queen of Pentacles", ["nurturing","practical","providing"], ["self-neglect","work-home conflict","smothering"], "You'll provide and protect today, warm and grounded; someone leans on you well.", "You've poured out everything; refill your own cup before it runs dry."],
  ["king", "King of Pentacles", ["abundance","leadership","security"], ["greed","stubbornness","over-indulgence"], "You'll command real resources today; lead with a steady, generous hand.", "The grip on wealth and status hardens you; loosen it before someone leaves."],
];

const SWORDS = [
  [1, "Ace of Swords", ["breakthrough","clarity","new idea"], ["confusion","clouded judgment","chaos"], "A single clear thought cuts through the fog today; you will finally see it.", "Your mind is loud and unsure; wait before you swing that sword."],
  [2, "Two of Swords", ["hard choice","stalemate","avoidance"], ["indecision","overload","confusion"], "You will sit between two options with your eyes shut; soon you must look.", "Too much input, no answer; the stalemate inside you finally breaks open."],
  [3, "Three of Swords", ["heartbreak","grief","hurt"], ["releasing pain","forgiveness","recovery"], "Words will cut today, and the ache is real; let it rain, then pass.", "You are finally setting down a hurt you carried too long."],
  [4, "Four of Swords", ["rest","recuperation","contemplation"], ["burnout","exhaustion","stagnation"], "Stop. The strongest move today is rest.", "You have run on empty too long; lie down before your body decides for you."],
  [5, "Five of Swords", ["conflict","winning at all costs","defeat"], ["reconciliation","making amends","past resentment"], "Someone will win the argument and lose the room; make sure it is not you.", "A grudge is ready to dissolve; reach out before pride stops you."],
  [6, "Six of Swords", ["transition","moving on","releasing baggage"], ["resisting change","unfinished business","stuck"], "You will leave a hard place behind today; the water gets calmer ahead.", "You keep one foot on the old shore; what you refuse to leave is holding you."],
  [7, "Seven of Swords", ["deception","strategy","getting away"], ["coming clean","self-deceit","secrets"], "Someone will quietly take what is not theirs; watch who slips away today.", "A secret wants out; the lie you tell yourself is the heaviest one."],
  [8, "Eight of Swords", ["restriction","trapped","victim mentality"], ["new perspective","releasing fear","freedom"], "You will feel boxed in today; look closer, the blindfold is yours to remove.", "The cage was never locked; you are about to walk out of it."],
  [9, "Nine of Swords", ["anxiety","fear","nightmares"], ["releasing worry","hope returning","deep-seated fears"], "You will wake at 3am with your worst thoughts; most of them are lying.", "The dread is loosening its grip; say the fear out loud and it shrinks."],
  [10, "Ten of Swords", ["painful ending","loss","rock bottom"], ["recovery","survival","regeneration"], "Something ends hard today; the good news is it cannot get worse than this.", "You survived the worst of it; the sun is already rising at your back."],
  ["page", "Page of Swords", ["curiosity","new ideas","mental energy"], ["all talk","haste","scattered"], "A sharp question will land in your lap today; chase it, it leads somewhere.", "Big words, no follow-through; someone is bluffing and it may be you."],
  ["knight", "Knight of Swords", ["ambition","driven","fast-thinking"], ["impulsive","scattered","burnout"], "You will charge full speed at a goal today; aim before you ride.", "You are moving too fast in every direction; slow down before you crash."],
  ["queen", "Queen of Swords", ["clear boundaries","honesty","independent"], ["cold-hearted","bitterness","easily influenced"], "You will say the honest thing today, kindly and without flinching.", "Hurt has made your words sharp; aim the blade away from people who care."],
  ["king", "King of Swords", ["authority","truth","mental clarity"], ["manipulation","misuse of power","harsh"], "Lead with the clear head today; your judgment is fair and people will trust it.", "Someone uses clever words to control, not clarify; do not be ruled by it."],
];

const WANDS = [
  [1, "Ace of Wands", ["inspiration","new opportunity","potential"], ["lack of direction","delays","boredom"], "A spark lands in your lap today; say yes before you talk yourself out of it.", "The idea is real but the fire won't catch; you are stalling at the starting line."],
  [2, "Two of Wands", ["planning","decisions","discovery"], ["fear of change","playing safe","bad planning"], "You will hold the whole map today; pick the bolder road, not the safe one.", "You'll cling to the comfortable choice; that fear is the only thing holding you."],
  [3, "Three of Wands", ["expansion","foresight","progress"], ["delays","obstacles","playing small"], "Your plans are already moving; watch the horizon, something good is sailing in.", "What you expected runs late today; you set your sights too small and now you wait."],
  [4, "Four of Wands", ["celebration","home","harmony"], ["home conflict","lack of support","transience"], "Someone will welcome you home today; let yourself be glad without bracing for it.", "The home feels unsteady today; the people meant to hold you are pulling away."],
  [5, "Five of Wands", ["competition","conflict","tension"], ["avoiding conflict","inner conflict","tension release"], "Everyone wants to be heard today; the squabble is messy but no one means real harm.", "You'll dodge the fight today; the real argument is the one going on inside you."],
  [6, "Six of Wands", ["victory","recognition","confidence"], ["lack of recognition","fall from grace","excess pride"], "You will be seen winning today; take the applause, you earned every clap.", "The credit you wanted goes unsaid today; check the pride before it costs you the room."],
  [7, "Seven of Wands", ["perseverance","defense","protection"], ["overwhelmed","giving up","exhaustion"], "You hold the high ground today; defend it, even outnumbered you are not wrong.", "You are tired of fighting today; do not lay down the thing worth keeping just yet."],
  [8, "Eight of Wands", ["swift action","movement","fast change"], ["delays","frustration","resisting change"], "Everything speeds up today; the message, the yes, the move all land at once.", "What should be flying gets stuck today; the holdup is partly you bracing against it."],
  [9, "Nine of Wands", ["resilience","persistence","boundaries"], ["exhaustion","paranoia","defensiveness"], "You are battered but standing; one more push today and the wall holds.", "You'll guard against a threat that isn't there today; the exhaustion is doing the talking."],
  [10, "Ten of Wands", ["burden","responsibility","hard work"], ["burnt out","release","delegation"], "You'll carry more than your share today; the load is real, the finish line is closer.", "Put some of it down today; you cannot keep doing it all and you were never meant to."],
  ["page", "Page of Wands", ["exploration","free spirit","discovery"], ["lack of direction","procrastination","self-doubt"], "A curious itch hits today; chase the new thing before you know where it leads.", "You'll scatter your spark today; the dream stalls because you keep putting it off."],
  ["knight", "Knight of Wands", ["adventure","passion","inspired action"], ["impulsiveness","haste","scattered energy"], "You will charge headfirst today; the boldness is thrilling, just aim before you leap.", "You'll rush and burn out today; that hot temper torches what your speed built."],
  ["queen", "Queen of Wands", ["confidence","courage","warmth"], ["insecurity","jealousy","self-doubt"], "You walk in warm and certain today; people lean toward you and you let them.", "A small jealousy gnaws today; rebuild your own footing before you read theirs."],
  ["king", "King of Wands", ["vision","leadership","boldness"], ["impulsiveness","overbearing","ruthlessness"], "You will see the whole board today; set the direction, others will follow your nerve.", "You'll push too hard today; the vision is right but the heavy hand undoes it."],
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
