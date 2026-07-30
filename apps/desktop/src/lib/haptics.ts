// Haptic feedback utility for mobile interactions using Web Vibration API

export type HapticImpactType = 'light' | 'medium' | 'heavy' | 'selection';
export type HapticNotificationType = 'success' | 'warning' | 'error';

/**
 * Trigger a short haptic vibration on mobile devices that support navigator.vibrate
 */
export function triggerHaptic(type: HapticImpactType | HapticNotificationType = 'light'): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return false;
  }

  try {
    switch (type) {
      case 'light':
      case 'selection':
        return navigator.vibrate(10);
      case 'medium':
        return navigator.vibrate(18);
      case 'heavy':
        return navigator.vibrate(28);
      case 'success':
        return navigator.vibrate([12, 40, 16]);
      case 'warning':
        return navigator.vibrate([20, 50, 20]);
      case 'error':
        return navigator.vibrate([30, 40, 30, 40, 30]);
      default:
        return navigator.vibrate(12);
    }
  } catch {
    return false;
  }
}
