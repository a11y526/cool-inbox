// 학교 PC 프로그램 화면: 휴대폰 연결(QR)과 연결된 휴대폰 목록.
import { useEffect, useState } from 'react';
import { HStack, Layout, LayoutContent, LayoutHeader, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@astryxdesign/core/Icon';
import { List, ListItem } from '@astryxdesign/core/List';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import QRCode from 'qrcode';

type Phone = { id: string; device: string | null; pairedAt: number; lastSync: number | null; sent: number; error: string | null };
type Status = {
  version: string;
  relay: string;
  update: { state: 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error'; version: string | null; error?: string | null };
  sync: { dbFound: boolean; lastRun: number | null; lastError: string | null; phones: Phone[]; pending: { id: string; createdAt: number; link: string } | null };
};

const pad = (n: number) => String(n).padStart(2, '0');
const timeText = (t: number | null) => {
  if (!t) return '아직 안 보냄';
  const d = new Date(t);
  const today = d.toDateString() === new Date().toDateString();
  return `${today ? '오늘' : `${d.getMonth() + 1}.${d.getDate()}`} ${d.getHours()}:${pad(d.getMinutes())}`;
};

function updateText(u: Status['update'], version: string): string {
  switch (u.state) {
    case 'checking': return `버전 ${version} · 새 버전 확인 중`;
    case 'downloading': return `버전 ${version} · 새 버전 ${u.version} 받는 중`;
    case 'ready': return `새 버전 ${u.version}을 받아 두었어요`;
    case 'latest': return `버전 ${version} · 최신 버전`;
    case 'error': return `버전 ${version} · 업데이트 실패${u.error ? ` (${u.error})` : ''}`;
    default: return `버전 ${version}`;
  }
}

const post = (path: string) => fetch(path, { method: 'POST' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'failed'); return d; });

export function PcHome() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQr] = useState('');
  const [installQr, setInstallQr] = useState('');
  const [os, setOs] = useState<'android' | 'ios'>(() => (localStorage.getItem('cool-pair-os') as 'android' | 'ios') || 'android');
  const [busy, setBusy] = useState<'' | 'android' | 'ios'>('');
  const [pairError, setPairError] = useState('');

  const load = () => fetch('/api/pc/status', { cache: 'no-store' }).then(r => r.json()).then(setStatus).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, []);

  const link = status?.sync.pending?.link;
  useEffect(() => {
    if (!link) { setQr(''); return; }
    QRCode.toDataURL(link, { margin: 1, width: 600, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [link]);

  // 첫 번째 QR: 앱 설치 (안드로이드 = APK 내려받기, 아이폰 = 웹앱 열기)
  const installLink = status ? (os === 'android' ? `${status.relay}/android` : `${status.relay}/`) : '';
  useEffect(() => {
    if (!installLink) return;
    QRCode.toDataURL(installLink, { margin: 1, width: 480, errorCorrectionLevel: 'M' }).then(setInstallQr).catch(() => setInstallQr(''));
  }, [installLink]);

  const pair = async (which: 'android' | 'ios') => {
    setOs(which);
    try { localStorage.setItem('cool-pair-os', which); } catch { /* 무시 */ }
    setBusy(which);
    setPairError('');
    try { await post('/api/pc/pair'); await load(); } catch (e) { setPairError(`중계 서버에 연결하지 못했어요. 이 PC의 인터넷 연결을 확인해 주세요. (${(e as Error).message})`); }
    setBusy('');
  };
  const unpair = async (id: string, label: string) => {
    if (!confirm(`${label} 연결을 끊을까요? 그 휴대폰에는 더 이상 새 쪽지가 가지 않아요.`)) return;
    await post(`/api/pc/unpair?id=${encodeURIComponent(id)}`).catch(() => {});
    load();
  };

  const s = status?.sync;

  return (
    <Layout
      height="fill"
      contentWidth={560}
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={0.5}>
            <Heading level={1}>쿨메신저 쪽지함</Heading>
            <Text type="supporting">{status ? updateText(status.update, status.version) : '준비 중'}</Text>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4} isScrollable>
          {!status || !s ? (
            <VStack padding={6} hAlign="center"><Spinner /></VStack>
          ) : (
            <VStack gap={4}>
              {status.update.state === 'ready' && (
                <Banner
                  status="info"
                  title={`새 버전 ${status.update.version}이 준비됐어요`}
                  description="다음에 컴퓨터를 켤 때 자동으로 설치돼요."
                  endContent={<Button label="지금 설치" size="sm" variant="secondary" onClick={() => post('/api/pc/restart')} />}
                />
              )}
              {!s.dbFound && (
                <Banner status="warning" title="쿨메신저 쪽지 파일을 찾지 못했어요" description="이 PC에 쿨메신저 젠투가 설치되어 있고, 한 번 이상 로그인했는지 확인해 주세요." />
              )}

              {s.pending ? (
                <Card padding={4}>
                  <VStack gap={4}>
                    <HStack gap={2} vAlign="center">
                      <Heading level={2}>{os === 'android' ? '안드로이드 휴대폰 연결' : '아이폰 연결'}</Heading>
                    </HStack>

                    <VStack gap={2} hAlign="center">
                      <Text weight="bold">1단계 · {os === 'android' ? '앱 설치' : '홈 화면에 추가'}</Text>
                      {installQr ? <img src={installQr} alt="앱 설치 QR" width={180} height={180} /> : <Spinner />}
                      <Text type="supporting" justify="center">
                        {os === 'android'
                          ? '휴대폰 카메라로 찍어 APK를 받아 설치해 주세요. 「출처를 알 수 없는 앱」 경고가 뜨면 「설정 → 이 출처 허용」을 켜고 설치하면 돼요. 이미 설치했으면 건너뛰세요.'
                          : '아이폰 카메라로 찍어 Safari로 연 뒤, 아래 공유 버튼(□↑) → 「홈 화면에 추가」를 눌러 주세요. 이미 추가했으면 건너뛰세요.'}
                      </Text>
                    </VStack>

                    <Divider />

                    <VStack gap={2} hAlign="center">
                      <Text weight="bold">2단계 · 앱 안에서 연결 QR 찍기</Text>
                      {qr ? <img src={qr} alt="휴대폰 연결 QR" width={220} height={220} /> : <Spinner />}
                      <Text type="supporting" justify="center">설치한 「쪽지함」 앱을 열고 「QR 찍기」를 눌러 이 QR을 찍어 주세요. 카메라 앱으로 찍지 말고 꼭 앱 안에서 찍어야 해요.</Text>
                      <HStack gap={2} vAlign="center">
                        <Spinner size="sm" />
                        <Text type="supporting">휴대폰 연결을 기다리는 중 · 30분 안에 찍어 주세요</Text>
                      </HStack>
                    </VStack>

                    <HStack hAlign="center">
                      <Button label="취소" variant="secondary" size="sm" onClick={() => post(`/api/pc/unpair?id=${encodeURIComponent(s.pending!.id)}`).then(load)} />
                    </HStack>
                  </VStack>
                </Card>
              ) : (
                <VStack gap={2}>
                  {pairError && <Banner status="error" title="연결을 시작하지 못했어요" description={pairError} />}
                  <Text weight="bold">{s.phones.length ? '휴대폰 하나 더 연결하기' : '휴대폰 연결하기'}</Text>
                  <HStack gap={2}>
                    <Button label="안드로이드" variant="primary" isLoading={busy === 'android'} icon={<Icon icon={DevicePhoneMobileIcon} size="sm" />} onClick={() => pair('android')} />
                    <Button label="아이폰" variant="primary" isLoading={busy === 'ios'} icon={<Icon icon={DevicePhoneMobileIcon} size="sm" />} onClick={() => pair('ios')} />
                  </HStack>
                </VStack>
              )}

              <Divider />

              <VStack gap={2}>
                <Heading level={2}>연결된 휴대폰</Heading>
                {s.phones.length === 0 ? (
                  <EmptyState
                    isCompact
                    title="아직 연결된 휴대폰이 없어요"
                    description="위에서 휴대폰 종류를 고르고 QR을 찍으면, 그때부터 받은 쪽지가 휴대폰으로 자동으로 가요."
                    icon={<Icon icon={DevicePhoneMobileIcon} size="lg" />}
                  />
                ) : (
                  <List hasDividers>
                    {s.phones.map(p => (
                      <ListItem
                        key={p.id}
                        startContent={<StatusDot variant={p.error ? 'warning' : 'success'} label={p.error ? '문제 있음' : '연결됨'} />}
                        label={p.device || '휴대폰'}
                        description={p.error ? `보내지 못했어요 · ${timeText(p.lastSync)}` : `쪽지 ${p.sent}개 보냄 · 마지막 ${timeText(p.lastSync)}`}
                        endContent={<Button label="연결 끊기" size="sm" variant="secondary" onClick={() => unpair(p.id, p.device || '휴대폰')} />}
                      />
                    ))}
                  </List>
                )}
              </VStack>

              <VStack gap={1}>
                <Text type="supporting">• 쪽지는 이 PC에서 암호화돼서 보내져요. 중계 서버는 내용을 읽을 수 없고, 휴대폰이 받아 가면 바로 지워요.</Text>
                <Text type="supporting">• 이 PC가 켜져 있어야 새 쪽지가 가요. 창을 닫아도 알림 영역에서 계속 보내요.</Text>
                <Text type="supporting">• 연결한 뒤에 온 쪽지의 첨부파일은 자동으로, 그 전 쪽지의 첨부파일은 휴대폰에서 누를 때 보내요.</Text>
              </VStack>
            </VStack>
          )}
        </LayoutContent>
      }
    />
  );
}
