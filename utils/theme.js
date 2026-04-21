// Design tokens – What Will Happen Today
// Premium dark theme with warm gold accent.

export const palette = {
  background: '#07080f',
  surface: '#0d1120',
  elevated: '#141928',
  glass: 'rgba(13,17,32,0.94)',
  glassBorder: 'rgba(255,255,255,0.07)',

  // Warm gold – premium without being garish
  accent: '#c9a96e',
  accentSoft: 'rgba(201,169,110,0.12)',
  accentGlow: 'rgba(201,169,110,0.06)',

  // Category colors
  love: '#e87c9a',
  loveSoft: 'rgba(232,124,154,0.12)',
  career: '#7db8f7',
  careerSoft: 'rgba(125,184,247,0.12)',
  money: '#6ed4b0',
  moneySoft: 'rgba(110,212,176,0.12)',
  mood: '#b89cf7',
  moodSoft: 'rgba(184,156,247,0.12)',

  // Text hierarchy
  text: '#eef0f5',
  textSub: '#9baabf',
  textMuted: '#5a6880',
  textDim: '#333c50',

  // Utility
  danger: '#e8736a',
  overlay: 'rgba(7,8,15,0.85)',
  blur: 'rgba(7,8,15,0.72)',
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

export const type = {
  hero: { fontSize: 38, fontWeight: '800', letterSpacing: -1.2 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '600', letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 23 },
  bodyMed: { fontSize: 15, fontWeight: '500', lineHeight: 23 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
};

export const CATEGORY_META = {
  love: {
    label: 'Love',
    color: palette.love,
    softBg: palette.loveSoft,
    gradient: ['rgba(232,124,154,0.18)', 'rgba(232,124,154,0)'],
    icon: '♥',
  },
  career: {
    label: 'Career',
    color: palette.career,
    softBg: palette.careerSoft,
    gradient: ['rgba(125,184,247,0.18)', 'rgba(125,184,247,0)'],
    icon: '◈',
  },
  money: {
    label: 'Money',
    color: palette.money,
    softBg: palette.moneySoft,
    gradient: ['rgba(110,212,176,0.18)', 'rgba(110,212,176,0)'],
    icon: '◎',
  },
  mood: {
    label: 'Mood',
    color: palette.mood,
    softBg: palette.moodSoft,
    gradient: ['rgba(184,156,247,0.18)', 'rgba(184,156,247,0)'],
    icon: '◉',
  },
};
