# v1.0.0 소스 공개 준비 점검

점검일: 2026-10-13. 실제 Key 값은 이 문서나 로그에 기록하지 않았습니다.

## 결과

- 공개 후보 파일에서 로컬 `.env`의 Key/Token/Password/Secret 값과 일치하는 문자열을 찾지 못했습니다.
- 개인 사용자명이 포함된 개발 PC 절대 경로를 찾지 못했습니다. Windows font 탐색의 일반적인 OS 경로는 유지합니다.
- `electron/main.js`, `test/electron.test.js`, `test/pdfReport.test.js`의 Key 형태 문자열은 smoke/unit test용 가짜 값으로 확인했습니다.
- `OPENAI_API_KEY`, `API Key`, `password`, `token` 등의 용어와 password input은 설정 참조·설명·보안 테스트이며 실제 credential 값과 구분해 점검했습니다.
- `.env`, 실제 papers, 생성된 review·embedding index, work, tmp, node_modules, installer/build output은 `.gitignore`에서 제외합니다. `papers/.gitkeep`, 소스, lockfile, 문서는 공개 후보에 남습니다.
- 현재 루트는 Git 저장소가 아니므로 기존 추적 파일이나 과거 Git 이력은 존재 여부를 검증할 수 없습니다. 루트에 `.git`을 생성하지 않고, 제외되는 임시 디렉터리의 Git 메타데이터로 `status`와 ignore 규칙을 검증했습니다.
- 이전 Windows package 검사에서도 개발 `.env`와 실제 Key 값, papers/work/output/test가 제외되고 renderer bundle에 credential이 포함되지 않은 것을 확인했습니다.

이는 현재 로컬 파일에 대한 점검입니다. 새 Key·논문·로그를 추가하거나 실제 저장소로 옮긴 후에는 다시 검사해야 합니다. 실제 commit/push/Release 게시는 수행하지 않았습니다.

## 공개하지 않을 파일

`.env*`의 실제 설정, API Key 파일, 사용자 PDF, `output/`, `work/`, `tmp/`, `.electron-test/`, `.npm-cache/`, `node_modules/`, `dist/`, `dist-desktop/`, `release/`, 개인 IDE 설정 및 로그.

`.env.example`은 예외적으로 허용하지만 현재 파일은 만들지 않았습니다. 나중에 추가할 때 실제 credential을 넣지 마세요. `.gitignore`는 이미 추적된 파일이나 기존 Git 이력을 자동으로 지우지 않습니다.

## Release asset

`release/AI Paper Reviewer Setup 1.0.0.exe`와 `release/SHA256SUMS.txt`는 Git commit 대상이 아니라 GitHub Releases에 별도로 첨부할 파일입니다. 설치 파일을 재빌드할 때 checksum도 갱신합니다.
