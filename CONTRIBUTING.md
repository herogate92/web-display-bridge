# Contributing

이슈와 풀 리퀘스트를 환영합니다. 기능 오류에는 Windows 버전, GPU, Virtual Display Driver 버전, 모바일 기기와 브라우저, 선택한 해상도·fps, 네트워크 환경과 재현 단계를 적어주세요. 로그를 공유할 때에는 로컬 IP와 장치 식별 정보를 지워주세요.

## 개발 환경

Windows x64, Node.js 22.12 이상과 .NET 9 SDK를 준비합니다.

```powershell
npm ci
npm run setup:electron
npm run build:native
npm run typecheck
npm test
npm run build
```

드라이버 관련 변경은 `driver.lock.json`의 버전, 출처, 라이선스와 SHA-256을 함께 갱신해야 합니다. 드라이버 바이너리나 개인 로그, 빌드 결과물은 커밋하지 마세요.

풀 리퀘스트에는 바뀐 동작과 검증 결과를 적어주세요. 디스플레이 활성화·복구 또는 WebRTC 성능 변경은 실제 Windows와 모바일 기기에서 확인한 조건과 결과를 포함해 주세요.
