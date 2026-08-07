import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/**
 * Initializes native mobile app features (Status Bar, Back Button, SplashScreen).
 */
export async function initNativeApp() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // 1. Status bar configuration
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#002D5D' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('StatusBar init warning:', err);
  }

  try {
    // 2. Hide Splash Screen after brief delay
    await SplashScreen.hide();
  } catch (err) {
    console.warn('SplashScreen hide warning:', err);
  }

  try {
    // 3. Android Hardware Back Button handler
    App.addListener('backButton', ({ canGoBack }) => {
      // Check if any modal or dialog overlay is currently open
      const openModal = document.querySelector('.modal-overlay, .dialog-overlay, [role="dialog"]');
      if (openModal) {
        // Find close button or trigger click/escape event
        const closeBtn = openModal.querySelector('.modal-close, button[aria-label="Close"], .btn-close') as HTMLElement;
        if (closeBtn) {
          closeBtn.click();
          return;
        }
      }

      // Check window history
      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        // Exit or minimize app if on root page
        App.minimizeApp();
      }
    });
  } catch (err) {
    console.warn('App backButton listener warning:', err);
  }
}

/**
 * Triggers light haptic feedback on touch interactions
 */
export async function triggerHaptic() {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Ignore if not supported
    }
  }
}
