import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { getPredictions } from '@/services/predictionEngine';
import {
  setLastOpened,
  isFirstOpenToday,
  isFirstEverOpen,
  markFirstOpenDone,
  bumpStreak,
  getDayNumber,
  isInFreeWindow,
  FREE_WINDOW,
  shouldShowDay4Banner,
  markDay4BannerSeen,
  getDailyRevealState,
  getHeroShuffleState,
  applyHeroShuffleResetNonce,
  getEntitlementInfo,
} from '@/services/storageService';
import { getDailyFreeCategory } from '@/utils/freeCategory';
import { getTodayKey } from '@/utils/dateUtils';
import { track, Events } from '@/services/analyticsService';
import { normalizeMonetizationConfig } from '@/services/monetizationConfig';

const PredictionsContext = createContext(null);

export function PredictionsProvider({ children }) {
  const [predictions, setPredictions] = useState(null);
  const [heroImage, setHeroImage] = useState(null);
  const [heroPool, setHeroPool] = useState(null);
  const [monetizationConfig, setMonetizationConfig] = useState(normalizeMonetizationConfig());
  const [revealState, setRevealState] = useState(null);
  const [heroShuffleState, setHeroShuffleState] = useState(null);
  const [entitlement, setEntitlement] = useState({ active: false, today: false, thirtyDay: false });
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFirstEver, setIsFirstEver] = useState(false);
  const [streak, setStreak] = useState(0);
  const [dayNumber, setDayNumber] = useState(1);
  const [inFreeWindow, setInFreeWindow] = useState(true);
  const [showDay4, setShowDay4] = useState(false);
  const lastDateKeyRef = useRef(getTodayKey());
  const lastEntitlementActiveRef = useRef(null);

  // Deterministic from today's date — no async needed
  const freeCategory = getDailyFreeCategory();

  const load = useCallback(async ({ silent = false, lifecycle = true } = {}) => {
    if (!silent) setLoading(true);
    try {
      const preds = await getPredictions();
      if (preds.heroPool?.heroShuffleResetNonce) {
        await applyHeroShuffleResetNonce(
          preds.heroPool.heroShuffleResetNonce,
          preds.heroPool.revision || preds.heroPool.updatedAt || null,
        );
      }
      const [
        entitlementState,
        dailyRevealState,
        dailyHeroShuffleState,
      ] = await Promise.all([
        getEntitlementInfo(),
        getDailyRevealState(),
        getHeroShuffleState(),
      ]);

      setPredictions(preds.predictions || null);
      setHeroImage(preds.heroImage || null);
      setHeroPool(preds.heroPool || null);
      setMonetizationConfig(normalizeMonetizationConfig(preds.monetizationConfig || {}));
      setRevealState(dailyRevealState);
      setHeroShuffleState(dailyHeroShuffleState);
      setEntitlement(entitlementState);
      setUnlocked(entitlementState.active);
      lastDateKeyRef.current = getTodayKey();

      if (preds.heroPool?.images?.length) {
        track(Events.HERO_POOL_LOADED, {
          image_count: preds.heroPool.images.length,
          hero_pool_revision: preds.heroPool.revision || null,
        });
      }

      if (lastEntitlementActiveRef.current === null) {
        if (entitlementState.active) {
          track(Events.ENTITLEMENT_ACTIVE, {
            today: entitlementState.today,
            thirty_day: entitlementState.thirtyDay,
            expires_at: entitlementState.expiresAt || 0,
          });
        }
        lastEntitlementActiveRef.current = entitlementState.active;
      } else if (lastEntitlementActiveRef.current !== entitlementState.active) {
        track(entitlementState.active ? Events.ENTITLEMENT_ACTIVE : Events.ENTITLEMENT_EXPIRED, {
          today: entitlementState.today,
          thirty_day: entitlementState.thirtyDay,
          expires_at: entitlementState.expiresAt || 0,
        });
        lastEntitlementActiveRef.current = entitlementState.active;
      }

      if (lifecycle) {
        const [firstOpen, firstEver, streakDays, day, freeWin, day4] = await Promise.all([
          isFirstOpenToday(),
          isFirstEverOpen(),
          bumpStreak(),
          getDayNumber(),
          isInFreeWindow(),
          shouldShowDay4Banner(),
        ]);
        setIsFirstEver(firstEver);
        setStreak(streakDays);
        setDayNumber(day);
        setInFreeWindow(freeWin);
        setShowDay4(day4);

        if (firstOpen) {
          await setLastOpened();
          track(Events.APP_OPEN, { free_category: freeCategory, day_number: day });
        }

        track(Events.DAILY_SCREEN_VIEW, {
          free_category: freeCategory,
          first_ever: firstEver,
          streak: streakDays,
          day_number: day,
          in_free_window: freeWin,
        });
      }
    } catch (err) {
      console.warn('[usePredictions] load error:', err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [freeCategory]);

  useEffect(() => {
    load();
  }, [load]);

  // Silently refresh content (hero image, LLM payload, ruleBucket, engineMode)
  // whenever the app returns to foreground so ops-console updates are picked
  // up without requiring an app restart.
  const lastForegroundAtRef = useRef(Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      // Throttle: only refresh if backgrounded for >5s (avoids spam on quick
      // OS sheets like permission prompts / share dialogs).
      if (now - lastForegroundAtRef.current < 5000) return;
      lastForegroundAtRef.current = now;
      const dateChanged = lastDateKeyRef.current !== getTodayKey();
      load({ silent: true, lifecycle: dateChanged });
    });
    return () => sub.remove();
  }, [load]);

  /** Called after a successful purchase to refresh unlock state. */
  const refreshUnlock = useCallback(async () => {
    const state = await getEntitlementInfo();
    setEntitlement(state);
    setUnlocked(state.active);
  }, []);

  const refreshRevealState = useCallback(async () => {
    const [dailyRevealState, dailyHeroShuffleState] = await Promise.all([
      getDailyRevealState(),
      getHeroShuffleState(),
    ]);
    setRevealState(dailyRevealState);
    setHeroShuffleState(dailyHeroShuffleState);
    return { revealState: dailyRevealState, heroShuffleState: dailyHeroShuffleState };
  }, []);

  /** Called after the first-time user finishes their full preview. */
  const dismissFirstEver = useCallback(async () => {
    await markFirstOpenDone();
    setIsFirstEver(false);
  }, []);

  /** Called when user dismisses the day-4 transition banner. */
  const dismissDay4 = useCallback(async () => {
    await markDay4BannerSeen();
    setShowDay4(false);
  }, []);

  return (
    <PredictionsContext.Provider
      value={{
        predictions,
        heroImage,
        heroPool,
        monetizationConfig,
        revealState,
        heroShuffleState,
        entitlement,
        unlocked,
        loading,
        refreshUnlock,
        refreshRevealState,
        refresh: () => load({ silent: true, lifecycle: false }),
        freeCategory,
        isFirstEver,
        dismissFirstEver,
        streak,
        dayNumber,
        inFreeWindow,
        freeWindowSize: FREE_WINDOW,
        showDay4,
        dismissDay4,
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
