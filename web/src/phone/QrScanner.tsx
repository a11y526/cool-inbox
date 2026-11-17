// 앱 안에서 QR 찍기 (아이폰 홈 화면 앱은 Safari와 저장 공간이 따로라, 앱 안에서 다시 찍어야 연결된다)
import { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import jsQR from 'jsqr';

export function QrScanner({ onCode, onCancel }: { onCode: (text: string) => boolean; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const scan = () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && ctx) {
        const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 480;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          if (onCode(code.data)) { stopped = true; return; }
          setWrong(true);
        }
      }
      raf = requestAnimationFrame(scan);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => {
        stream = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        raf = requestAnimationFrame(scan);
      })
      .catch(() => setError('카메라를 열지 못했어요. 설정에서 카메라 사용을 허용해 주세요.'));

    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()); };
  }, [onCode]);

  return (
    <VStack gap={3}>
      {error ? <Banner status="error" title={error} /> : (
        <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 'var(--radius-container, 12px)', background: 'black', aspectRatio: '1 / 1', objectFit: 'cover' }} />
      )}
      <Text type="supporting">{wrong ? '쪽지함 연결 QR이 아니에요. 학교 PC 화면의 「휴대폰 연결」 QR을 찍어 주세요.' : '학교 PC 화면에 보이는 연결 QR을 비춰 주세요.'}</Text>
      <Button label="취소" variant="secondary" onClick={onCancel} />
    </VStack>
  );
}
