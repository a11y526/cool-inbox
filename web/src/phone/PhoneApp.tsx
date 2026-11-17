// 휴대폰 웹앱: QR로 학교 PC와 연결하고, 받은 쪽지를 보여 준다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Center } from '@astryxdesign/core/Center';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Spinner } from '@astryxdesign/core/Spinner';
import { CameraIcon, Cog6ToothIcon, QrCodeIcon } from '@heroicons/react/24/outline';
import { QrScanner } from './QrScanner';
import { parsePairingHash } from '../../shared/box.mjs';
import Inbox from '../Inbox';
import type { InboxSource } from '../api';
import { receiver } from './receiver';
import { clearAll, loadPairing, savePairing, type PairingInfo } from './store';
import { isInstalled, isIos, useInstall } from './install';

/** 처음 연결했을 때 맨 위에 보이는 설치 안내. 설치했거나 닫으면 다시 안 보인다. */
function InstallBanner() {
  const { canPrompt, installed, install } = useInstall();
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('cool-inbox-install-hidden') === '1'; } catch { return false; } });
  if (installed || hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem('cool-inbox-install-hidden', '1'); } catch { /* 무시 */ } };
  if (canPrompt) {
    return (
      <Banner
        status="info"
        title="앱으로 설치하기"
        description="설치하면 앱 목록에 「쪽지함」이 생기고, 앱처럼 바로 열려요. 받은 쪽지도 그대로 남아요."
        endContent={<Button label="설치" size="sm" variant="primary" onClick={async () => { if (await install()) hide(); }} />}
        isDismissable
        onDismiss={hide}
      />
    );
  }
  return (
    <Banner
      status="info"
      title="홈 화면에 추가해 두세요"
      description={isIos ? '아래 공유 버튼(□↑) → 「홈 화면에 추가」를 누르면 앱처럼 열 수 있어요. 받은 쪽지도 그대로 남아요.' : '브라우저 메뉴(⋮) → 「앱 설치」 또는 「홈 화면에 추가」를 누르면 앱처럼 열 수 있어요.'}
      isDismissable
      onDismiss={hide}
    />
  );
}

export function PhoneApp() {
  const [pairing, setPairing] = useState<PairingInfo | null>(loadPairing);
  const [joining, setJoining] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [unpaired, setUnpaired] = useState(false);
  const [settings, setSettings] = useState(false);
  const [note, setNote] = useState('');

  const [scanning, setScanning] = useState(false);

  /** 연결 정보를 저장하고 PC에 인사한다 */
  const join = async (p: { id: string; phoneToken: string; key: string }) => {
    const info = { ...p, pairedAt: Date.now() };
    setScanning(false);
    setJoining('busy');
    try {
      if (pairing && pairing.id !== info.id) await clearAll(); // 다른 PC로 새로 연결
      await receiver(info).hello();
      savePairing(info);
      setPairing(info);
      setUnpaired(false);
      setJoining('idle');
    } catch {
      setJoining('failed');
    }
  };

  // QR(휴대폰 카메라)로 열렸으면 연결한다. 주소창에서 열쇠는 바로 지운다.
  useEffect(() => {
    const p = parsePairingHash(location.hash);
    if (!p) return;
    history.replaceState(null, '', location.pathname + location.search);
    join(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 앱 안에서 찍은 QR
  const onCode = useCallback((text: string) => {
    const p = parsePairingHash(text.slice(text.indexOf('#')));
    if (!p) return false;
    join(p);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing]);

  const r = useMemo(() => (pairing ? receiver(pairing) : null), [pairing]);
  const source = useMemo<InboxSource | null>(() => {
    if (!r) return null;
    return {
      ...r.source,
      load: async () => {
        try { return await r.source.load(); } catch (e) { if ((e as Error).message === 'unpaired') setUnpaired(true); throw e; }
      },
    };
  }, [r]);

  if (joining === 'busy') {
    return (
      <Center height="100%">
        <VStack gap={3} hAlign="center" padding={6}><Spinner /><Heading level={2}>학교 PC와 연결하는 중</Heading></VStack>
      </Center>
    );
  }

  if (!pairing || !source || unpaired) {
    // 아이폰 Safari: 홈 화면 앱과 저장 공간이 따로라, 먼저 홈 화면에 추가하고 그 앱 안에서 연결해야 한다
    const iosSafari = isIos && !isInstalled();
    return (
      <Center height="100%">
        <VStack padding={6} gap={4} maxWidth={420} width="100%">
          {scanning ? (
            <QrScanner onCode={onCode} onCancel={() => setScanning(false)} />
          ) : iosSafari ? (
            <>
              <EmptyState
                title="먼저 홈 화면에 추가해 주세요"
                description="아래 공유 버튼(□↑)을 누르고 「홈 화면에 추가」를 눌러 주세요. 그다음 홈 화면에 생긴 「쪽지함」을 열고, 학교 PC 화면의 두 번째 QR을 앱 안에서 찍으면 연결돼요."
                icon={<Icon icon={QrCodeIcon} size="lg" />}
              />
              <Text type="supporting">아이폰은 Safari와 홈 화면 앱이 저장 공간을 따로 써서, 꼭 홈 화면 앱 안에서 연결해야 쪽지가 남아요.</Text>
            </>
          ) : (
            <>
              <EmptyState
                title={unpaired ? '학교 PC와 연결이 끊겼어요' : '학교 PC와 연결해 주세요'}
                description="학교 PC의 「쿨메신저 쪽지함」 프로그램에서 「휴대폰 연결하기」를 누르고, 아래 버튼으로 화면의 연결 QR을 찍어 주세요."
                icon={<Icon icon={QrCodeIcon} size="lg" />}
                actions={<Button label="QR 찍기" variant="primary" icon={<Icon icon={CameraIcon} size="sm" />} onClick={() => setScanning(true)} />}
              />
            </>
          )}
          {joining === 'failed' && <Banner status="error" title="연결하지 못했어요" description="인터넷 연결을 확인하고, 학교 PC에서 새 QR을 띄워 다시 찍어 주세요. QR은 30분이 지나면 쓸 수 없어요." />}
        </VStack>
      </Center>
    );
  }

  return (
    <>
      <Inbox
        source={source}
        pollMs={60_000}
        notice={<InstallBanner />}
        headerEnd={<IconButton label="설정" variant="secondary" icon={<Icon icon={Cog6ToothIcon} size="sm" />} onClick={() => setSettings(true)} />}
      />
      <Dialog isOpen={settings} onOpenChange={setSettings} width={420}>
        <DialogHeader title="설정" onOpenChange={setSettings} />
        <VStack gap={4} padding={4}>
          <VStack gap={1}>
            <Text weight="bold">학교 PC와 연결됨</Text>
            <Text type="supporting">{new Date(pairing.pairedAt).toLocaleDateString('ko-KR')}에 연결했어요. 학교 PC가 켜져 있으면 새 쪽지가 자동으로 들어와요.</Text>
          </VStack>
          <VStack gap={1}>
            <Button
              label="쪽지 전체 다시 받기"
              variant="secondary"
              onClick={async () => { await r!.resync().catch(() => {}); setNote('학교 PC에 요청했어요. 몇 분 안에 다시 들어와요.'); }}
            />
            <Text type="supporting">쪽지가 빠진 것 같을 때 눌러 주세요. 이미 받은 쪽지는 그대로 있어요.</Text>
          </VStack>
          {note && <Banner status="success" title={note} />}
          <VStack gap={1}>
            <Button
              label="연결 끊기"
              variant="secondary"
              onClick={async () => {
                if (!confirm('학교 PC와 연결을 끊고 이 휴대폰에 저장된 쪽지를 모두 지울까요?')) return;
                await r!.unpair().catch(() => {});
                await clearAll();
                savePairing(null);
                setPairing(null);
                setSettings(false);
              }}
            />
            <Text type="supporting">이 휴대폰에 저장된 쪽지도 함께 지워져요.</Text>
          </VStack>
        </VStack>
      </Dialog>
    </>
  );
}
