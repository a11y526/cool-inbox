// 어느 화면을 보여 줄지 고른다.
//   휴대폰 웹앱 빌드(--mode phone)  → 휴대폰: QR 연결 + 받은 쪽지
//   ?inbox=1                         → 받은 쪽지 화면 (개발용: 이 PC의 쪽지를 바로 보기)
//   그 밖                            → 학교 PC 프로그램: 휴대폰 연결
import { lazy, Suspense } from 'react';
import { PcHome } from './PcHome';

const Inbox = lazy(() => import('./Inbox'));
const PhoneApp = lazy(() => import('./phone/PhoneApp').then(m => ({ default: m.PhoneApp })));

export default function App() {
  if (import.meta.env.MODE === 'phone' || new URLSearchParams(location.search).has('phone')) return <Suspense><PhoneApp /></Suspense>;
  if (new URLSearchParams(location.search).has('inbox')) return <Suspense><Inbox /></Suspense>;
  return <PcHome />;
}
