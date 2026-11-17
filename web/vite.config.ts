import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// 개발 서버에서도 PC 앱과 같은 /api를 쓴다. 쿨메신저가 없는 컴퓨터에서는 예시 쪽지 파일(sample/)을 읽는다.
function coolApi(): Plugin {
  return {
    name: 'cool-api',
    async configureServer(server) {
      process.env.COOL_DB ??= path.resolve(import.meta.dirname, 'sample/sample.udb')
      process.env.COOL_FILES_ROOT ??= path.resolve(import.meta.dirname, 'sample/files')
      // @ts-expect-error 서버 코드는 JS 모듈
      const { handleApi } = await import('./server/api.mjs')
      // @ts-expect-error 서버 코드는 JS 모듈
      const { pcStatus, startLanServer } = await import('./server/pc.mjs')
      // 휴대폰 테스트 페이지는 빌드된 dist를 쓴다 (npm run build 후 확인)
      startLanServer(path.resolve(import.meta.dirname, 'dist'))
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/pc/status')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(pcStatus({ version: 'dev', update: { state: 'idle', version: null } })))
          return
        }
        if (!handleApi(req, res)) next()
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), coolApi()],
})
