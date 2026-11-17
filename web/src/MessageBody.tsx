// 쪽지 본문 HTML을 격리된 iframe 안에 보여 준다. 스크립트는 실행되지 않고, 링크는 새 창(PC 앱은 브라우저)으로 열린다.
import { useEffect, useRef, useState } from 'react';

function clean(html: string): string {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,iframe,frame,object,embed,link,meta,base,form,input,button,textarea,select').forEach(x => x.remove());
  for (const el of d.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      const v = a.value.trim();
      if (n.startsWith('on') || (['href', 'src'].includes(n) && !/^(https?:|mailto:|data:image\/)/i.test(v))) el.removeAttribute(a.name);
    }
  }
  return d.body.innerHTML;
}

/** iframe 안은 Astryx 테마가 닿지 않아서, 바깥 테마의 글꼴·색을 읽어 그대로 넘긴다. */
function frameDoc(html: string, host: HTMLElement | null): string {
  const cs = host ? getComputedStyle(host) : null;
  const font = cs?.fontFamily || 'system-ui, sans-serif';
  const color = cs?.color || 'inherit';
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{margin:0;background:transparent;color:${color};font:15px/1.65 ${font};overflow-wrap:anywhere}
    p{margin:0 0 .8em} img{max-width:100%;height:auto} a{color:inherit}
    table{border-collapse:collapse;margin:.4em 0} td,th{border:1px solid color-mix(in srgb, currentColor 22%, transparent);padding:.3em .6em}
  </style></head><body>${clean(html)}</body></html>`;
}

export function MessageBody({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const [doc, setDoc] = useState('');

  useEffect(() => { setDoc(frameDoc(html, host.current)); }, [html]);

  const fit = () => {
    const b = frame.current?.contentDocument?.documentElement;
    if (b) setHeight(b.scrollHeight + 4);
  };

  return (
    <div ref={host}>
      <iframe
        ref={frame}
        title="쪽지 본문"
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        onLoad={fit}
        style={{ border: 0, width: '100%', height, display: 'block' }}
      />
    </div>
  );
}
