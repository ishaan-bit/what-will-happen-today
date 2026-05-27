const CATEGORY_TOUCHES = {
  love: 'love',
  career: 'career',
  money: 'money',
  mood: 'mood',
};

const AVOID = {
  love: 'Do not turn a small silence into a full story.',
  career: 'Do not over-explain when a clear answer would do.',
  money: 'Do not spend just to change the mood of the moment.',
  mood: 'Do not call every heavy feeling a warning.',
};

const SAY_YES = {
  love: 'Say yes to the honest check-in.',
  career: 'Say yes to the task that makes your work visible.',
  money: 'Say yes to the pause before the purchase.',
  mood: 'Say yes to the quieter plan.',
};

const MOVE = {
  love: 'Send one clean message without rehearsing it ten times.',
  career: 'Finish the thing that has been almost done.',
  money: 'Move one amount, however small, toward the responsible choice.',
  mood: 'Take ten minutes away from the loudest input.',
};

export function getDeeperMeaning(category, prediction = {}) {
  const existing = prediction.deeperMeaning || prediction.deepMeaning;
  if (existing && typeof existing === 'object') {
    return {
      avoid: existing.avoid || existing.whatToAvoid || AVOID[category] || AVOID.mood,
      sayYesTo: existing.sayYesTo || existing.yesTo || SAY_YES[category] || SAY_YES.mood,
      touches: existing.touches || existing.whatThisTouches || CATEGORY_TOUCHES[category] || 'mood',
      move: existing.move || existing.smallMove || existing.oneSmallMove || MOVE[category] || MOVE.mood,
    };
  }

  return {
    avoid: AVOID[category] || AVOID.mood,
    sayYesTo: SAY_YES[category] || SAY_YES.mood,
    touches: CATEGORY_TOUCHES[category] || 'mood',
    move: prediction.action || MOVE[category] || MOVE.mood,
  };
}
