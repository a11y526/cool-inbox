// 학교 PC 프로그램 화면: 휴대폰으로 찍을 QR과 연결 상태.
import { useEffect, useState } from 'react';
import { HStack, Layout, LayoutContent, LayoutHeader, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import QRCode from 'qrcode';

type Status = {
  version: string;
  update: { state: 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error'; version: string | null };
  port: number;
  addresses: { ip: string; name: string; virtual: boolean }[];
  testUrl: string | null;
  lanError: string | null;
  phones: { at: string; ip: string; device: string }[];
};

const timeText = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function updateText(u: Status['update'], version: string): string {
  switch (u.state) {
    case 'checking': return `버전 ${version} · 새 버전 확인 중`;
    case 'downloading': return `버전 ${version} · 새 버전 ${u.version} 받는 중`;
    case 'ready': return `새 버전 ${u.version}을 받아 두었어요`;
    case 'latest': return `버전 ${version} · 최신 버전이에요`;
    case 'error': return `버전 ${version} · 업데이트를 확인하지 못했어요`;
    default: return `버전 ${version}`;
  }
}

export function PcHome() {
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/pc/status', { cache: 'no-store' }).then(r => r.json()).then(s => alive && setStatus(s)).catch(() => {});
    load();
    const t = setInterval(load, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!status?.testUrl) return;
    QRCode.toDataURL(status.testUrl, { margin: 1, width: 560, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [status?.testUrl]);

  const phone = status?.phones[0];

  return (
    <Layout
      height="fill"
      contentWidth={520}
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
          {!status ? (
            <VStack padding={6} hAlign="center"><Spinner /></VStack>
          ) : (
            <VStack gap={4}>
              {status.update.state === 'ready' && (
                <Banner
                  status="info"
                  title={`새 버전 ${status.update.version}이 준비됐어요`}
                  description="다음에 컴퓨터를 켤 때 자동으로 설치돼요. 지금 바로 설치하려면 「다시 시작」을 누르세요."
                  endContent={<Button label="다시 시작" size="sm" variant="secondary" onClick={() => fetch('/api/pc/restart', { method: 'POST' })} />}
                />
              )}

              <VStack gap={1}>
                <Heading level={2}>휴대폰 연결 테스트</Heading>
                <Text type="supporting">휴대폰을 학교 와이파이에 연결한 뒤 카메라로 QR을 찍어 보세요. 휴대폰에 「연결 성공」이 뜨면 학교 PC와 휴대폰이 직접 연결될 수 있어요.</Text>
              </VStack>

              {status.lanError ? (
                <Banner status="error" title="연결 창구를 열지 못했어요" description={status.lanError === 'port-in-use' ? '프로그램이 이미 하나 켜져 있는지 확인해 주세요.' : `오류: ${status.lanError}`} />
              ) : !status.testUrl ? (
                <Banner status="warning" title="이 PC의 네트워크 주소를 찾지 못했어요" description="랜선이나 와이파이가 연결되어 있는지 확인해 주세요." />
              ) : (
                <Card padding={4}>
                  <VStack gap={3} hAlign="center">
                    {qr ? <img src={qr} alt="휴대폰 연결 테스트 QR" width={240} height={240} /> : <Spinner />}
                    <Text type="supporting" hasTabularNumbers>{status.testUrl.replace(/\?.*/, '')}</Text>
                  </VStack>
                </Card>
              )}

              <Card padding={4}>
                {phone ? (
                  <HStack gap={3} vAlign="center">
                    <StatusDot variant="success" label="연결 성공" />
                    <StackItem size="fill">
                      <VStack gap={0.5}>
                        <Text weight="bold">연결 성공 — {phone.device}</Text>
                        <Text type="supporting">{timeText(phone.at)} · 휴대폰 주소 {phone.ip}</Text>
                      </VStack>
                    </StackItem>
                  </HStack>
                ) : (
                  <HStack gap={3} vAlign="center">
                    <Spinner size="sm" />
                    <Text type="supporting">휴대폰이 QR을 찍기를 기다리는 중</Text>
                  </HStack>
                )}
              </Card>

              <VStack gap={1}>
                <Heading level={3}>휴대폰에서 안 열리면</Heading>
                <Text type="supporting">• 휴대폰이 모바일 데이터(LTE·5G)가 아니라 학교 와이파이에 연결돼 있는지 확인해 주세요.</Text>
                <Text type="supporting">• 처음 켤 때 Windows 방화벽 창이 떴다면 「허용」을 눌러야 해요.</Text>
                <Text type="supporting">• 그래도 안 되면 학교 유선망과 와이파이가 분리된 거예요. 그 경우엔 중계 서버 방식(B)으로 가면 돼요.</Text>
              </VStack>

              {status.addresses.length > 1 && (
                <VStack gap={1}>
                  <Text type="supporting">이 PC의 다른 주소 (QR이 안 될 때 휴대폰 주소창에 입력)</Text>
                  {status.addresses.slice(1).map(a => (
                    <Text key={a.ip} type="supporting" hasTabularNumbers>http://{a.ip}:{status.port}/?phone=1 · {a.name}</Text>
                  ))}
                </VStack>
              )}
            </VStack>
          )}
        </LayoutContent>
      }
    />
  );
}
