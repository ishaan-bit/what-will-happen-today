import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getPredictions } from '@/services/predictionEngine';
import { isUnlocked } from '@/services/storageService';
import { setLastOpened, isFirstOpenToday } from '@/services/storageService';
import { track, Events } from '@/services/analyticsService';

const PredictionsContext = createContext(null);

export function PredictionsProvider({ children }) {
  const [predictions, setPredictions] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [preds, unlockedState, firstOpen] = await Promise.all([
        getPredictions(),
        isUnlocked(),
        isFirstOpenToday(),
      ]);

      setPredictions(preds);
      setUnlocked(unlockedState);

      if (firstOpen) {
        await setLastOpened();
        track(Events.APP_OPEN);
      }
    } catch (err) {
      console.warn('[usePredictions] load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Called after a successful purchase to refresh unlock state. */
  const refreshUnlock = useCallback(async () => {
    const state = await isUnlocked();
    setUnlocked(state);
  }, []);

  return (
    <PredictionsContext.Provider value={{ predictions, unlocked, loading, refreshUnlock }}>
      {children}
    </PredictionsContext.Provider>
  );
}

export function usePredictions() {
  const ctx = useContext(PredictionsContext);
  if (!ctx) throw new Error('usePredictions must be used inside PredictionsProvider');
  return ctx;
}
