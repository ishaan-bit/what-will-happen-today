import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  initBilling,
  teardownBilling,
  fetchProducts,
  purchaseProduct,
  restorePurchases,
  PRODUCT_DAILY,
  PRODUCT_FULL,
} from '@/services/billingService';
import { fallbackPrice } from '@/services/productCatalog';
import { track, Events } from '@/services/analyticsService';

const BillingContext = createContext(null);

export function BillingProvider({ children, onPurchaseComplete }) {
  const [products, setProducts] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [initStatus, setInitStatus] = useState({ ready: false, reason: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const result = await initBilling(async ({ productId }) => {
        track(Events.PURCHASE_SUCCESS, { productId });
        if (productId === PRODUCT_DAILY) {
          track(Events.PURCHASE_SUCCESS_29, { productId });
        } else if (productId === PRODUCT_FULL) {
          track(Events.PURCHASE_SUCCESS_49, { productId });
        }
        if (onPurchaseComplete) onPurchaseComplete({ productId });
      });
      if (!mounted) return;
      setInitStatus({ ready: result.ok, reason: result.reason || null });
      if (result.ok) {
        fetchProducts().then((p) => mounted && setProducts(p)).catch(() => null);
      }
    })();
    return () => {
      mounted = false;
      teardownBilling();
    };
  }, [onPurchaseComplete]);

  const getPrice = useCallback(
    (productId) => {
      const product = products.find((p) => p.productId === productId);
      // Fallback prices come from the canonical catalog, never hardcoded here,
      // so ₹29 (daily) / ₹49 (30-day) can never be transposed.
      return product?.localizedPrice ?? fallbackPrice(productId);
    },
    [products]
  );

  const ensureReady = useCallback(() => {
    if (!initStatus.ready) {
      Alert.alert(
        'Payments unavailable',
        'In-app purchases are not active in this build. Please install the latest version from Google Play (internal testing track).',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  }, [initStatus.ready]);

  const buyDaily = useCallback(async () => {
    if (purchasing) return;
    if (!ensureReady()) return;
    track(Events.PURCHASE_TAP_29, { productId: PRODUCT_DAILY });
    track(Events.PURCHASE_START, { productId: PRODUCT_DAILY });
    setPurchasing(true);
    try {
      await purchaseProduct(PRODUCT_DAILY);
    } catch (err) {
      if (err.message !== 'Purchase cancelled') {
        track(Events.PURCHASE_FAILED_29, { productId: PRODUCT_DAILY, reason: err.message });
        track(Events.PURCHASE_FAIL, { productId: PRODUCT_DAILY, reason: err.message });
        Alert.alert('Purchase failed', err.message, [{ text: 'OK' }]);
      }
    } finally {
      setPurchasing(false);
    }
  }, [purchasing, ensureReady]);

  const buyFull = useCallback(async () => {
    if (purchasing) return;
    if (!ensureReady()) return;
    track(Events.PURCHASE_TAP_49, { productId: PRODUCT_FULL });
    track(Events.PURCHASE_START, { productId: PRODUCT_FULL });
    setPurchasing(true);
    try {
      await purchaseProduct(PRODUCT_FULL);
    } catch (err) {
      if (err.message !== 'Purchase cancelled') {
        track(Events.PURCHASE_FAILED_49, { productId: PRODUCT_FULL, reason: err.message });
        track(Events.PURCHASE_FAIL, { productId: PRODUCT_FULL, reason: err.message });
        Alert.alert('Purchase failed', err.message, [{ text: 'OK' }]);
      }
    } finally {
      setPurchasing(false);
    }
  }, [purchasing, ensureReady]);

  const restore = useCallback(async () => {
    if (restoring) return false;
    if (!ensureReady()) return false;
    track(Events.RESTORE_ATTEMPT);
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (!ok) {
        Alert.alert('Nothing to restore', 'No previous purchases found on this Google account.', [{ text: 'OK' }]);
      }
      return ok;
    } finally {
      setRestoring(false);
    }
  }, [restoring, ensureReady]);

  return (
    <BillingContext.Provider
      value={{
        products,
        purchasing,
        restoring,
        billingReady: initStatus.ready,
        getPrice,
        buyDaily,
        buyFull,
        restore,
      }}
    >
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error('useBilling must be used inside BillingProvider');
  return ctx;
}
