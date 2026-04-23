/**
 * Root layout – wraps the entire app in providers.
 * Matches TriggerMap patterns: GestureHandlerRootView, SafeAreaProvider,
 * error boundary, then application providers.
 */

import { Platform } from 'react-native';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { PredictionsProvider, usePredictions } from '@/hooks/usePredictions';
import { BillingProvider } from '@/hooks/useBilling';
import { initAnalytics } from '@/services/analyticsService';
import { initCrashMonitoring } from '@/services/crashService';
import { registerForPushNotificationsAsync } from '@/services/pushService';

// Initialize monitoring as early as possible
initCrashMonitoring();
initAnalytics();

// Prevent splash from auto-hiding (it will hide once the layout mounts)
SplashScreen.preventAutoHideAsync().catch(() => null);

if (Platform.OS === 'android') {
  NavigationBar.setBackgroundColorAsync('transparent').catch(() => null);
  NavigationBar.setPositionAsync('absolute').catch(() => null);
}

/**
 * BillingBridge
 * Lives inside PredictionsProvider so it can call refreshUnlock()
 * when a purchase completes and the billing listener fires.
 */
function BillingBridge({ children }) {
  const { refreshUnlock } = usePredictions();

  return (
    <BillingProvider onPurchaseComplete={refreshUnlock}>
      {children}
    </BillingProvider>
  );
}

function AppInner() {
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => null);
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="legal/privacy" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="legal/terms" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <PredictionsProvider>
            <BillingBridge>
              <StatusBar
                style="light"
                translucent={Platform.OS === 'android'}
                backgroundColor="transparent"
              />
              <AppInner />
            </BillingBridge>
          </PredictionsProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
