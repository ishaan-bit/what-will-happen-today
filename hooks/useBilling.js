import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  initBilling,
  teardownBilling,
  fetchProducts,
  purchaseProduct,
  restorePurchases,
  PRODUCT_DAILY,
  PRODUCT_FULL,
} from '@/services/billingService';
import { track, Events } from '@/services/analyticsService';

const BillingContext = createContext(null);

export function BillingProvider({ children, onPurchaseComplete }) {
  const [products, setProducts] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    initBilling(async ({ productId }) => {
      track(Events.PURCHASE_SUCCESS, { productId });
      if (onPurchaseComplete) onPurchaseComplete({ productId });
    });

    fetchProducts().then(setProducts).catch(() => null);

    return () => teardownBilling();
  }, [onPurchaseComplete]);

  const getPrice = useCallback(
    (productId) => {
      const product = products.find((p) => p.productId === productId);
      return product?.localizedPrice ?? (productId === PRODUCT_DAILY ? '₹29' : '₹49');
    },
    [products]
  );

  const buyDaily = useCallback(async () => {
    if (purchasing) return;
    track(Events.PURCHASE_START, { productId: PRODUCT_DAILY });
    setPurchasing(true);
    try {
      await purchaseProduct(PRODUCT_DAILY);
    } catch (err) {
      if (err.message !== 'Purchase cancelled') {
        track(Events.PURCHASE_FAIL, { productId: PRODUCT_DAILY, reason: err.message });
      }
      throw err;
    } finally {
      setPurchasing(false);
    }
  }, [purchasing]);

  const buyFull = useCallback(async () => {
    if (purchasing) return;
    track(Events.PURCHASE_START, { productId: PRODUCT_FULL });
    setPurchasing(true);
    try {
      await purchaseProduct(PRODUCT_FULL);
    } catch (err) {
      if (err.message !== 'Purchase cancelled') {
        track(Events.PURCHASE_FAIL, { productId: PRODUCT_FULL, reason: err.message });
      }
      throw err;
    } finally {
      setPurchasing(false);
    }
  }, [purchasing]);

  const restore = useCallback(async () => {
    if (restoring) return false;
    track(Events.RESTORE_ATTEMPT);
    setRestoring(true);
    try {
      return await restorePurchases();
    } finally {
      setRestoring(false);
    }
  }, [restoring]);

  return (
    <BillingContext.Provider
      value={{ products, purchasing, restoring, getPrice, buyDaily, buyFull, restore }}
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
