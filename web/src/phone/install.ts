// 홈 화면/앱 설치. 안드로이드 크롬은 버튼 한 번으로 설치(크롬이 앱으로 만들어 깐다), 아이폰은 안내만 가능.
import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // 크롬 기본 안내 대신 우리 버튼으로
  deferred = e as InstallEvent;
  listeners.forEach(f => f());
});
addEventListener('appinstalled', () => { deferred = null; listeners.forEach(f => f()); });

export const isIos = /iphone|ipad/i.test(navigator.userAgent);
export const isAndroid = /android/i.test(navigator.userAgent);
export const isNativeApp = () => !!(window as { Capacitor?: unknown }).Capacitor;
export const isInstalled = () => isNativeApp() || matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** 설치 버튼을 보여 줄 수 있는지와, 누르면 설치 창을 띄우는 함수 */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick(n => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  return {
    canPrompt: !!deferred,
    installed: isInstalled(),
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      return outcome === 'accepted';
    },
  };
}
