import * as Haptics from 'expo-haptics';

export function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
}

export function expand() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
}

export function unlock() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
}

export function warning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => null);
}
