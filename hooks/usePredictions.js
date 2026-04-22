import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getPredictions } from '@/services/predictionEngine';
import {
  isUnlocked,
  setLastOpened,
  isFirstOpenToday,
  isFirstEverOpen,
  markFirstOpenDone,
  bumpStreak,
} from '@/services/storageService';
import { getDailyFreeCategory } from '@/utils/freeCategory';
import { track, Events } from '@/services/analyticsService';

const PredictionsContext = createContext(null);

export function PredictionsProvider({ children }) {
  const [predictions, setPredictions] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFirstEver, setIsFirstEver] = useState(false);
  const [streak, setStreak] = useState(0);

  // Deterministic from today's date — no async needed
  const freeCategory = getDailyFreeCategory();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preds, unlockedState, firstOpen, firstEver, streakDays] = await Promise.all([
        getPredictions(),
        isUnlocked(),
        isFirstOpenToday(),
        isFirstEverOpen(),
        bumpStreak(),
      ]);

      setPredictions(preds);
      setUnlocked(unlockedState);
      setIsFirstEver(firstEver);
      setStreak(streakDays);

      if (firstOpen) {
        await setLastOpened();
        track(Events.APP_OPEN, { free_category: freeCategory });
      }

      track(Events.DAILY_SCREEN_VIEW, {
        free_category: freeCategory,
        first_ever: firstEver,
        streak: streakDays,
      });
    } catch (err) {
      console.warn('[usePredictions] load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [freeCategory]);

  useEffect(() => {
    load();
  }, [load]);

  /** Called after a successful purchase to refresh unlock state. */
  const refreshUnlock = useCallback(async () => {
    const state = await isUnlocked();
    setUnlocked(state);
  }, []);

  /** Called after the first-time user finishes their full preview. */
  const dismissFirstEver = useCallback(async () => {
    await markFirstOpenDone();
    setIsFirstEver(false);
  }, []);

  return (
    <PredictionsContext.Provider
      value={{
        predictions,
        unlocked,
        loading,
        refreshUnlock,
        freeCategory,
        isFirstEver,
        dismissFirstEver,
        streak,
      }}
    >
      {children}
    </PredictionsContext.Provider>
  );
}

export function usePredictions() {
  const ctx = useContext(PredictionsContext);
  if (!ctx) throw new Error('usePredictions must be used inside PredictionsProvider');
  return ctx;
}
