// 어느 화면을 보여 줄지 고른다.
//   ?phone=1  휴대폰: 학교 PC 연결 테스트
//   ?inbox=1  받은 쪽지 화면 (휴대폰 앱에서 쓸 화면, 지금은 개발용)
//   그 밖     학교 PC 프로그램: QR + 연결 상태
import { lazy, Suspense } from 'react';
import { PcHome } from './PcHome';
import { PhoneTest } from './PhoneTest';

const Inbox = lazy(() => import('./Inbox'));

export default function App() {
  const q = new URLSearchParams(location.search);
  if (q.has('phone')) return <PhoneTest />;
  if (q.has('inbox')) return <Suspense><Inbox /></Suspense>;
  return <PcHome />;
}
