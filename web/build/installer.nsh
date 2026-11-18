; 설치·업데이트 전에 켜져 있는 쪽지함을 끈다.
; 창을 닫아도 알림 영역에 남는 프로그램이라 기본 "닫기 요청"으로는 꺼지지 않아서 강제로 끈다.
; 예전 버전(실행 파일 이름이 한글)과 새 버전(CoolInbox.exe) 모두.
!macro customCheckAppRunning
  DetailPrint "켜져 있는 쿨메신저 쪽지함을 끄는 중"
  ; 이름(예전 한글 이름 포함)으로, 그리고 설치 폴더 안에서 실행 중인 것은 이름과 상관없이 모두 끈다.
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $$_.ProcessName -in @('CoolInbox','쿨메신저 쪽지함') -or ($$_.Path -and $$_.Path.StartsWith('$INSTDIR\', [StringComparison]::OrdinalIgnoreCase)) } | Stop-Process -Force -ErrorAction SilentlyContinue"`
  Pop $0
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM CoolInbox.exe`
  Pop $0
  Sleep 1500
!macroend

; 예전 버전의 제거 프로그램이 망가져 있어도(0.2.x는 Mac에서 만들어 "integrity check" 오류가 난다) 설치·업데이트를 멈추지 않는다.
; 새 파일로 그대로 덮어쓰고, 제거 정보도 새 버전 것으로 다시 쓴다.
!macro customUnInstallCheck
  ClearErrors
  ${if} $R0 != 0
    DetailPrint "예전 버전 제거가 끝나지 않았어요 (코드 $R0). 새 버전으로 덮어씁니다."
  ${endif}
!macroend
!macro customUnInstallCheckCurrentUser
  ClearErrors
!macroend
