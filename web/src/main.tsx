import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@astryxdesign/core/theme'
import './index.css'
import { themes, defaultThemeSlug } from './astryx-themes'
import App from './App.tsx'

// 휴대폰 웹앱: 홈 화면 아이콘과, 인터넷이 없어도 열리게 하는 서비스 워커
if (import.meta.env.MODE === 'phone') {
  const add = (rel: string, href: string) => { const l = document.createElement('link'); l.rel = rel; l.href = href; document.head.append(l); };
  add('manifest', './manifest.webmanifest');
  add('apple-touch-icon', './apple-touch-icon.png');
  const meta = (name: string, content: string) => { const m = document.createElement('meta'); m.name = name; m.content = content; document.head.append(m); };
  meta('apple-mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-title', '쪽지함');
  meta('theme-color', '#1f2937');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme theme={themes[defaultThemeSlug]}>
      <App />
    </Theme>
  </StrictMode>,
)
