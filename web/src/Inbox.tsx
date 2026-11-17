// 쿨메신저 쪽지함 — 받은 쪽지를 확인만 하는 앱. 넓은 화면은 목록 + 본문 창, 좁은 화면은 목록 → 본문.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HStack, Layout, LayoutContent, LayoutHeader, LayoutPanel, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable';
import { Spinner } from '@astryxdesign/core/Spinner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { ArrowLeftIcon, ArrowPathIcon, InboxIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import { loadSeen, pcSource, saveSeen, type InboxSource, type Message } from './api';
import type { ReactNode } from 'react';
import { MessageBody } from './MessageBody';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 목록용: 오늘이면 시각, 올해면 월.일, 아니면 연.월.일 */
function shortWhen(at: string): string {
  if (!at) return '';
  const d = new Date(at), now = new Date();
  if (d.toDateString() === now.toDateString()) return `${d.getHours()}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}.${d.getDate()}`;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}
/** 본문용: 2026.11.17(월) 8:42 */
function longWhen(at: string): string {
  if (!at) return '';
  const d = new Date(at);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}(${WD[d.getDay()]}) ${d.getHours()}:${pad(d.getMinutes())}`;
}
function sizeText(n: number | null): string {
  if (n == null) return '';
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`;
}

type Load = { state: 'loading' } | { state: 'error'; reason: string } | { state: 'ready'; list: Message[] };

export default function Inbox({ source = pcSource, headerEnd, notice, pollMs = 60_000 }: { source?: InboxSource; headerEnd?: ReactNode; notice?: ReactNode; pollMs?: number }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<number | null>(null);
  const [seen, setSeen] = useState<Set<number>>(loadSeen);
  const isNarrow = useMediaQuery('(max-width: 799px)');

  const refresh = useCallback(async () => {
    try {
      const list = await source.load();
      setLoad({ state: 'ready', list });
    } catch (e) {
      setLoad({ state: 'error', reason: e instanceof Error ? e.message : 'read-failed' });
    }
  }, [source]);

  // 처음 한 번 읽고, 그다음엔 1분마다 새 쪽지를 확인한다
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [refresh, pollMs]);

  const list = load.state === 'ready' ? load.list : [];
  const isUnread = (m: Message) => m.unread && !seen.has(m.key);
  const unreadCount = list.filter(isUnread).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter(m => `${m.title} ${m.from} ${m.files.map(f => f.name).join(' ')}`.toLowerCase().includes(q)) : list;
  }, [list, query]);

  const open = list.find(m => m.key === openKey) ?? null;

  // 좁은 화면(휴대폰)에서는 쪽지를 열 때 방문 기록을 하나 쌓는다 → 안드로이드 「뒤로」가 앱을 끄지 않고 목록으로 돌아간다
  useEffect(() => {
    const onPop = () => setOpenKey(null);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const closeDetail = () => { if (history.state?.coolDetail) history.back(); else setOpenKey(null); };

  const choose = (m: Message) => {
    if (isNarrow && openKey == null) history.pushState({ coolDetail: true }, '');
    setOpenKey(m.key);
    if (isUnread(m)) {
      const next = new Set(seen).add(m.key);
      setSeen(next);
      saveSeen(next);
    }
  };

  const pane = useResizable({ defaultSize: '58%', minSize: 380 });

  const header = (
    <LayoutHeader hasDivider padding={4}>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center">
          <StackItem size="fill">
            <VStack gap={0.5}>
              <Heading level={1}>받은 쪽지</Heading>
              <Text type="supporting">
                {load.state === 'ready' ? (unreadCount ? `안 읽은 쪽지 ${unreadCount}개 · 전체 ${list.length}개` : `전체 ${list.length}개 · 모두 읽었어요`) : '쿨메신저 쪽지를 불러오는 중'}
              </Text>
            </VStack>
          </StackItem>
          <IconButton label="새로 고침" tooltip="새 쪽지 확인" variant="secondary" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={refresh} />
          {headerEnd}
        </HStack>
        {notice}
        <TextInput
          label="쪽지 찾기"
          isLabelHidden
          placeholder="보낸 사람 · 제목 · 첨부 파일 이름으로 찾기"
          startIcon="search"
          value={query}
          onChange={v => setQuery(v)}
          hasClear
        />
      </VStack>
    </LayoutHeader>
  );

  const listView =
    load.state === 'loading' ? (
      <VStack padding={6} hAlign="center"><Spinner /></VStack>
    ) : load.state === 'error' ? (
      <VStack padding={6}>
        <EmptyState
          title={load.reason === 'no-db' ? '쿨메신저 쪽지 파일을 찾지 못했어요' : '쪽지를 읽지 못했어요'}
          description={load.reason === 'no-db' ? '이 PC에 쿨메신저 젠투가 설치되어 있고, 한 번 이상 로그인했는지 확인해 주세요.' : '잠시 후 다시 시도해 주세요.'}
          icon={<Icon icon={InboxIcon} size="lg" />}
          actions={<Button label="다시 시도" variant="secondary" onClick={refresh} />}
        />
      </VStack>
    ) : visible.length === 0 ? (
      <VStack padding={6}>
        <EmptyState
          title={query ? '찾는 쪽지가 없어요' : '받은 쪽지가 없어요'}
          description={query ? '다른 낱말로 찾아보세요.' : '새 쪽지가 오면 여기에 보여요.'}
          icon={<Icon icon={InboxIcon} size="lg" />}
          actions={query ? <Button label="찾기 지우기" variant="secondary" onClick={() => setQuery('')} /> : undefined}
        />
      </VStack>
    ) : (
      <List hasDividers density="balanced">
        {visible.map(m => (
          <ListItem
            key={m.key}
            itemKey={m.key}
            isSelected={m.key === openKey}
            onClick={() => choose(m)}
            startContent={<VStack width={8} hAlign="center">{isUnread(m) && <StatusDot variant="accent" label="안 읽음" />}</VStack>}
            label={
              <HStack gap={2} vAlign="center">
                <StackItem size="fill"><Text weight={isUnread(m) ? 'bold' : 'normal'} maxLines={1}>{m.from}</Text></StackItem>
                <Text type="supporting" hasTabularNumbers>{shortWhen(m.at)}</Text>
              </HStack>
            }
            description={
              <HStack gap={1} vAlign="center">
                {m.files.length > 0 && <Icon icon={PaperClipIcon} size="xsm" color="secondary" label="첨부 있음" />}
                <Text color={isUnread(m) ? 'primary' : 'secondary'} weight={isUnread(m) ? 'medium' : 'normal'} maxLines={1}>{m.title || '(제목 없음)'}</Text>
              </HStack>
            }
          />
        ))}
      </List>
    );

  const detail = open ? <MessagePane source={source} message={open} onBack={isNarrow ? closeDetail : undefined} /> : null;

  if (isNarrow) {
    return (
      <Layout
        height="fill"
        header={open ? undefined : header}
        content={<LayoutContent padding={open ? 0 : 2} isScrollable>{open ? detail : listView}</LayoutContent>}
      />
    );
  }

  return (
    <Layout
      height="fill"
      header={header}
      content={<LayoutContent padding={2} isScrollable>{listView}</LayoutContent>}
      end={
        <>
          <ResizeHandle direction="horizontal" isReversed hasDivider pillPlacement="end" resizable={pane.props} label="본문 창 크기 조절" />
          <LayoutPanel resizable={pane.props} padding={0} role="complementary" label="쪽지 본문">
            {detail ?? (
              <VStack padding={6} height="100%" vAlign="center">
                <EmptyState title="쪽지를 골라 주세요" description="왼쪽 목록에서 쪽지를 누르면 여기에 내용이 보여요." icon={<Icon icon={InboxIcon} size="lg" />} />
              </VStack>
            )}
          </LayoutPanel>
        </>
      }
    />
  );
}

function MessagePane({ source, message: m, onBack }: { source: InboxSource; message: Message; onBack?: () => void }) {
  const [body, setBody] = useState<{ key: number; html: string } | { key: number; error: true } | null>(null);
  const [fileError, setFileError] = useState('');

  useEffect(() => {
    let alive = true;
    setFileError('');
    source.body(m.key)
      .then(html => alive && setBody({ key: m.key, html }))
      .catch(() => alive && setBody({ key: m.key, error: true }));
    return () => { alive = false; };
  }, [m.key, source]);

  const current = body?.key === m.key ? body : null;

  return (
    <VStack gap={0}>
      <VStack gap={2} padding={4}>
        {onBack && (
          <HStack><Button label="목록" variant="secondary" size="sm" icon={<Icon icon={ArrowLeftIcon} size="sm" />} onClick={onBack} /></HStack>
        )}
        <Heading level={2} wordBreak="break-word">{m.title || '(제목 없음)'}</Heading>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge variant="neutral" label={m.from} />
          <Text type="supporting" hasTabularNumbers>{longWhen(m.at)}</Text>
        </HStack>
        {m.files.length > 0 && (
          <VStack gap={1}>
            <HStack gap={1} wrap="wrap">
              {m.files.map(f => (
                <Token
                  key={f.name}
                  label={f.name}
                  description={sizeText(f.size)}
                  icon={<Icon icon={PaperClipIcon} size="xsm" />}
                  onClick={async () => {
                    setFileError('');
                    const r = await source.openFile(m.key, f.name).catch(() => 'missing' as const);
                    if (r === 'requested') {
                      setFileError(`「${f.name}」 파일을 학교 PC에 요청했어요. 학교 PC가 켜져 있으면 1~2분 안에 받아져요.`);
                      // 도착할 때까지 10초마다 확인 (최대 5분)
                      if (source.fileArrived) {
                        for (let i = 0; i < 30; i++) {
                          await new Promise(res => setTimeout(res, 10_000));
                          if (await source.fileArrived(m.key, f.name)) { setFileError(`「${f.name}」 파일을 받았어요. 한 번 더 누르면 열려요.`); break; }
                        }
                      }
                    }
                    else if (r === 'tooBig') setFileError(`「${f.name}」 파일은 너무 커서(25MB 넘음) 휴대폰으로 보내지 못했어요. 학교 PC에서 열어 주세요.`);
                    else if (r === 'missing') setFileError(`「${f.name}」 파일을 찾지 못했어요. 쿨메신저에서 아직 받지 않았거나 옮겨졌을 수 있어요.`);
                  }}
                />
              ))}
            </HStack>
            {fileError && <HStack gap={1} vAlign="center"><Icon icon="warning" size="sm" color="warning" /><Text type="supporting">{fileError}</Text></HStack>}
          </VStack>
        )}
      </VStack>
      <Divider />
      <VStack padding={4}>
        {!current ? <Spinner /> : 'error' in current ? <HStack gap={1} vAlign="center"><Icon icon="warning" size="sm" color="warning" /><Text>본문을 읽지 못했어요.</Text></HStack> : <MessageBody html={current.html} />}
      </VStack>
    </VStack>
  );
}
