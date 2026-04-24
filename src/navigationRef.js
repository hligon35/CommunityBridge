import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function resetToLogin() {
  try {
    if (!navigationRef.isReady()) return;
    navigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      })
    );
  } catch (e) {
    // ignore
  }
}

export function resetToTwoFactor() {
  const doReset = () => {
    try {
      if (!navigationRef.isReady()) {
        try { console.warn('[nav] resetToTwoFactor: navigationRef not ready, retrying in 100ms'); } catch (_) {}
        setTimeout(doReset, 100);
        return;
      }
      try { console.info('[nav] resetToTwoFactor: dispatching reset → TwoFactor'); } catch (_) {}
      navigationRef.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'TwoFactor' }],
        })
      );
    } catch (e) {
      try { console.error('[nav] resetToTwoFactor error', e); } catch (_) {}
    }
  };
  doReset();
}
