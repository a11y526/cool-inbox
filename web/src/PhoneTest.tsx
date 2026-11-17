// 휴대폰 화면: 학교 PC 연결 테스트. 이 페이지가 열렸다는 것 자체가 휴대폰 → 학교 PC 연결이 된다는 뜻이다.
import { useEffect, useState } from 'react';
import { Center } from '@astryxdesign/core/Center';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@astryxdesign/core/Icon';
import { Spinner } from '@astryxdesign/core/Spinner';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

export function PhoneTest() {
  const [pc, setPc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/phone/hello', { method: 'POST' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setPc(d.pc || '학교 PC'))
      .catch(() => setFailed(true));
  }, []);

  return (
    <Center height="100%">
      <VStack padding={6} gap={3} hAlign="center" maxWidth={420}>
        {pc ? (
          <EmptyState
            title="연결 성공"
            description={`이 휴대폰이 학교 PC(${pc})에 연결됐어요. 학교 PC 화면에도 「연결 성공」이 떴는지 확인해 보세요.`}
            icon={<Icon icon={CheckCircleIcon} size="lg" color="success" />}
          />
        ) : failed ? (
          <EmptyState title="연결은 됐지만 확인에 실패했어요" description="이 페이지는 열렸으니 학교 PC와 연결은 돼요. 학교 PC 프로그램을 다시 켜고 한 번 더 찍어 보세요." icon={<Icon icon="warning" size="lg" color="warning" />} />
        ) : (
          <>
            <Spinner />
            <Heading level={2}>학교 PC에 연결하는 중</Heading>
            <Text type="supporting">잠시만 기다려 주세요.</Text>
          </>
        )}
      </VStack>
    </Center>
  );
}
