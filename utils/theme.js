// Design tokens – What Will Happen Today
// "Occult tarot deck" — candlelit gold on warm near-black, gilt-engraved
// borders, foil shimmer, jewel-toned suits. Premium, mystical, alive.

import { Platform } from 'react-native';

export const palette = {
  // Warm near-black, faint aubergine ink underneath
  background: '#08070c',
  ink: '#0c0a11',
  surface: '#15111d',
  elevated: '#1d1726',
  glass: 'rgba(18,14,26,0.94)',
  glassBorder: 'rgba(232,220,192,0.09)',

  // Candlelit gold — the gilt of an old deck
  accent: '#d4af6e',
  accentBright: '#f1d9a4',   // foil highlight
  accentDeep: '#a8814a',     // engraved shadow
  accentSoft: 'rgba(212,175,110,0.13)',
  accentGlow: 'rgba(212,175,110,0.07)',
  gilt: 'rgba(212,175,110,0.55)',
  giltSoft: 'rgba(212,175,110,0.22)',
  filigree: 'rgba(241,217,164,0.40)',
  parchment: '#e9dcc1',      // warm cream for rare highlights

  // Category / suit colors — jewel-toned
  love: '#e3899f',
  loveSoft: 'rgba(227,137,159,0.13)',
  career: '#82b4ef',
  careerSoft: 'rgba(130,180,239,0.13)',
  money: '#74d2ab',
  moneySoft: 'rgba(116,210,171,0.13)',
  mood: '#bfa0ee',
  moodSoft: 'rgba(191,160,238,0.13)',

  // Text hierarchy
  text: '#f2ece0',
  textSub: '#a99f93',
  textMuted: '#6c6356',
  textDim: '#3b362f',

  // Utility
  danger: '#e08a6a',
  overlay: 'rgba(6,5,10,0.88)',
  scrim: 'rgba(6,5,10,0.66)',
  blur: 'rgba(8,7,12,0.74)',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
};

// A serif face gives the "real tarot deck" feel for names and headings.
export const fonts = {
  serif: Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' }),
  serifBold: Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' }),
};

export const type = {
  hero: { fontSize: 40, fontWeight: '800', letterSpacing: -1.2 },
  display: { fontFamily: fonts.serif, fontSize: 30, fontWeight: '700', letterSpacing: 0.2 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  serifTitle: { fontFamily: fonts.serif, fontSize: 23, fontWeight: '700', letterSpacing: 0.2 },
  cardName: { fontFamily: fonts.serif, fontSize: 22, fontWeight: '700', letterSpacing: 0.3 },
  heading: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 23 },
  bodyMed: { fontSize: 15, fontWeight: '500', lineHeight: 23 },
  serifBody: { fontFamily: fonts.serif, fontSize: 16, fontWeight: '400', lineHeight: 26 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
};

// Reusable gradient sets for the candlelit, gilt look.
export const gradients = {
  // Vertical warmth from gilt to deep ink — used on framed panels.
  foil: ['rgba(241,217,164,0.16)', 'rgba(212,175,110,0.05)', 'rgba(8,7,12,0)'],
  // Card-art bottom scrim so the name plate reads over any image.
  artScrim: ['rgba(6,5,10,0.02)', 'rgba(6,5,10,0.42)', 'rgba(6,5,10,0.94)'],
  // The engraved card back.
  cardBack: ['#1b1424', '#120d18', '#0a0710'],
  // Full-screen modal backdrop wash.
  modalWash: ['rgba(10,7,16,0.96)', 'rgba(6,5,10,0.99)'],
};

// One canonical icon per life area. Distinct, legible, tarot-appropriate.
// IMPORTANT: this is the *category* badge. The drawn card's own suit glyph
// (content/tarotDeck.js) only appears on the revealed face as card identity —
// never as the category badge (that was the "hearts everywhere" bug).
export const CATEGORY_META = {
  love: {
    label: 'Love',
    color: palette.love,
    softBg: palette.loveSoft,
    gradient: ['rgba(227,137,159,0.20)', 'rgba(227,137,159,0)'],
    glow: 'rgba(227,137,159,0.55)',
    icon: '♥',          // cups / the heart
    suitName: 'Cups',
  },
  career: {
    label: 'Career',
    color: palette.career,
    softBg: palette.careerSoft,
    gradient: ['rgba(130,180,239,0.20)', 'rgba(130,180,239,0)'],
    glow: 'rgba(130,180,239,0.55)',
    icon: '⚔',          // swords / ambition & decisions
    suitName: 'Swords',
  },
  money: {
    label: 'Money',
    color: palette.money,
    softBg: palette.moneySoft,
    gradient: ['rgba(116,210,171,0.20)', 'rgba(116,210,171,0)'],
    glow: 'rgba(116,210,171,0.55)',
    icon: '◈',          // pentacles / coin & worth
    suitName: 'Pentacles',
  },
  mood: {
    label: 'Mood',
    color: palette.mood,
    softBg: palette.moodSoft,
    gradient: ['rgba(191,160,238,0.20)', 'rgba(191,160,238,0)'],
    glow: 'rgba(191,160,238,0.55)',
    icon: '☾',          // the moon / inner weather
    suitName: 'Wands',
  },
};
