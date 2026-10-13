# AI Paper Reviewer

AI 기반 학술 논문 심사 보조 프로그램입니다. PDF 논문의 기여와 실험 근거를 검토하고, 비판과 반론을 종합해 최종 평가를 제공합니다. 실제 학술 심사나 연구자의 판단을 대체하지 않습니다.

```text
PDF → RAG / Evidence Retrieval → Summary Agent → Critical Reviewer
    → Advocate Agent → Reviewer–Advocate Debate → Meta Reviewer → Final Review
```

하나의 Critical Reviewer가 논문을 통합 평가합니다. PDF 처리와 Agent orchestration은 사용자의 PC에서 수행하며, 별도 중앙 서버 없이 Electron Desktop 앱으로 실행됩니다.

## 다운로드

GitHub 저장소의 **Releases** 페이지에서 최신 버전의 `AI Paper Reviewer Setup x.x.x.exe`를 다운로드하세요. 현재 배포 파일명은 `AI Paper Reviewer Setup 1.0.0.exe`입니다.

실제 저장소 URL과 Release 링크는 저장소 생성 및 첫 Release 게시 후 이 위치에 추가합니다. 아직 공개 Release가 게시되었다는 의미는 아닙니다.

## 주요 기능

- PDF 논문 분석 및 한국어 / English 리뷰
- RAG 기반 논문 근거 검색: chunking, embeddings, local vector index, cosine similarity
- Summary Agent, Critical Reviewer, Advocate Agent
- 최대 3라운드 Reviewer–Advocate Debate
- Meta Reviewer의 최종 verdict, 점수, 강점·약점·개선 사항
- 중간 Agent 결과와 토론 기록 확인
- JSON review 및 PDF Review Report 저장
- 사용자 자신의 OpenAI API Key 사용과 선택적 로컬 암호화 저장

## 시스템 요구사항

- Windows 10 또는 Windows 11, x64
- OpenAI API 연결이 가능한 인터넷 환경
- 자신의 OpenAI API Key 및 사용 모델에 접근 가능한 API 계정
- 한국어 보고서를 위한 Unicode 폰트(예: Windows의 맑은 고딕)

설치 앱 사용에는 Node.js를 별도로 설치할 필요가 없습니다. 개발 및 소스 빌드에는 Node.js 24와 npm을 권장합니다. 현재 검증은 Windows 11에서 수행했으며 모든 Windows 10 환경을 별도로 테스트하지는 않았습니다.

## 설치

1. 저장소의 Releases 페이지에서 최신 Release를 선택합니다.
2. `AI Paper Reviewer Setup x.x.x.exe`를 다운로드합니다.
3. 설치 파일을 실행하고 설치 위치를 선택합니다.
4. 시작 메뉴 또는 데스크톱 바로가기에서 AI Paper Reviewer를 실행합니다.

현재 개발 버전은 Windows 코드 서명이 적용되지 않았을 수 있으므로 SmartScreen 경고가 나타날 수 있습니다. 파일의 출처와 Release 정보를 확인한 후 사용하세요. 배포된 `SHA256SUMS.txt`가 있으면 다운로드 파일의 SHA-256을 비교할 수 있습니다.

## 사용 방법

1. AI Paper Reviewer를 실행합니다.
2. 자신의 OpenAI API Key를 입력합니다.
3. 필요하면 **이 PC에 API Key 저장**을 선택합니다.
4. **PDF 파일 선택**에서 논문을 선택합니다(최대 20 MB).
5. 리뷰 언어를 한국어 또는 English로 선택합니다.
6. **논문 리뷰 시작**을 누르고 단계별 진행 상태를 확인합니다.
7. 최종 리뷰와 접이식 중간 Agent 결과를 확인합니다.
8. **JSON 저장** 또는 **PDF 보고서 저장**으로 결과를 저장합니다.

PDF 저장 위치는 native save dialog에서 선택합니다. 저장 취소는 오류가 아닙니다. PDF 보고서는 최종 평가, 주요 쟁점과 짧은 Reviewer·Advocate 요약을 포함하며 긴 토론 transcript는 생략합니다.

## API Key와 논문 데이터

- 프로그램과 설치 파일에는 개발자의 API Key가 포함되지 않습니다. 각 사용자가 자신의 Key를 사용하며 API 비용은 해당 API 계정에서 발생합니다.
- 저장을 선택한 경우 Electron `safeStorage`로 암호화한 Buffer를 `userData/api-key.dat`에 저장합니다. 전체 저장 Key는 renderer에 반환하지 않습니다.
- **저장된 API Key 삭제**는 저장 파일과 현재 Key 참조를 제거합니다. Key는 리뷰 JSON이나 PDF metadata·본문에 포함하지 않습니다.
- Desktop 앱은 개발용 `.env`의 Key를 자동 사용하지 않습니다. OpenAI client는 main process에서 생성해 Agent에 전달합니다.
- 선택한 PDF 자체는 별도 중앙 서버에 업로드하지 않습니다. PDF parsing과 local vector index 관리는 PC에서 수행합니다.
- embedding 생성과 AI 분석을 위해 추출된 논문 텍스트가 OpenAI API로 전송됩니다. Summary 단계 등에서는 전체 추출 텍스트가 전송될 수 있으므로 미공개·기밀 논문의 사용 정책과 권한을 확인하세요.
- 작업 결과와 embedding index는 `userData/work/<UUID>/`에 저장됩니다. **작업 데이터 삭제**로 제거할 수 있으며 원본 PDF는 삭제하지 않습니다.
- 검색된 evidence는 논문 전체가 아닙니다. 검색에서 확인되지 않은 정보를 논문에 없다고 단정하지 않도록 지시하지만 AI 결과는 원문과 대조해야 합니다.

## 최종 판정과 결과 파일

Verdict는 `STRONG_ACCEPT`, `ACCEPT`, `WEAK_ACCEPT`, `BORDERLINE`, `WEAK_REJECT`, `REJECT`, `STRONG_REJECT` 중 하나입니다. 점수는 1~10 정수입니다. JSON field와 enum은 출력 언어에 따라 번역되지 않습니다.

- `fullReview.json`: 논문 정보, 언어, Summary·Reviewer·Advocate·Debate·Final Review
- `finalReview.json`: Meta Reviewer 최종 평가
- `<Paper_Title>_Review.pdf`: 읽기 쉬운 최종 보고서

한글 PDF는 설치된 Unicode 폰트를 동적으로 찾아 사용한 글자를 PDF에 embed합니다. 시스템 폰트를 앱 배포 패키지에 복사하지 않으며 필요한 폰트가 없으면 오류를 표시합니다. 개발 환경에서는 `REPORT_FONT_PATH`로 추가 Unicode 폰트를 지정할 수 있습니다.

## 개발

저장소를 clone한 후 프로젝트 루트에서 실행합니다.

```sh
npm install
npm run dev
```

`npm run dev`는 Astro 정적 UI를 빌드한 뒤 Electron을 실행합니다. HTTP 서버를 띄우지 않으며 UI 변경 후 다시 실행하면 반영됩니다. Electron 바이너리가 누락되었다면 공식 설치 스크립트 `node node_modules/electron/install.js`를 실행합니다.

| 명령 | 역할 |
| --- | --- |
| `npm run electron` | 이미 빌드한 UI로 Electron 실행 |
| `npm run build` | `dist-desktop/`에 정적 UI 빌드 |
| `npm test` | 단위·통합 테스트 |
| `npm run dist:win` | Windows x64 NSIS 설치 파일 생성 |
| `npm run dev -- --smoke-test` | 격리된 테스트 userData에서 앱·암호화·PDF 생성 검증 후 종료 |
| `npm start` / `npm run cli` | 기존 CLI 실행 |
| `npm run web:dev` | 선택적 기존 Astro 웹 개발 서버 |
| `npm run web:build` / `npm run web:preview` | 기존 웹 앱 빌드 / preview |

PowerShell에서 `npm.ps1`이 차단되면 `npm.cmd`를 사용합니다. CLI와 선택적 웹 서버만 로컬 `.env`의 `OPENAI_API_KEY`를 사용할 수 있으며 `.env`를 커밋하지 마세요. Desktop 사용자는 `.env` 없이 자신의 Key를 입력합니다.

CLI 테스트 논문은 로컬에서 직접 추가합니다.

```sh
npm run cli -- papers/my-paper.pdf
npm run cli -- papers/my-paper.pdf --retrieval-only
```

## 프로젝트 구조

```text
electron/          # main, preload, safeStorage, 보안 검증, PDF 보고서
desktop-ui/        # Astro 정적 Desktop entry
src/               # Agent, RAG, PDF Reader, 기존 웹 UI 및 pipeline
scripts/           # Desktop build/run launcher
test/              # 단위·통합 테스트
docs/              # Release notes 및 배포 절차
papers/.gitkeep    # 실제 논문은 사용자 로컬에서 추가
package.json
package-lock.json
LICENSE
```

`output/`, `work/`, `tmp/`, `.electron-test/`, `dist/`, `dist-desktop/`, `release/`는 로컬 생성 데이터이며 Git에서 제외합니다. Desktop 실제 작업 위치는 프로젝트의 `work/`가 아닌 Electron userData 내부입니다.

## GitHub Release 배포

현재 버전은 `1.0.0`, productName은 **AI Paper Reviewer**입니다. `npm run dist:win` 결과인 `release/AI Paper Reviewer Setup 1.0.0.exe`는 소스 저장소에 커밋하지 않고 **GitHub Release asset**으로 업로드합니다.

첫 배포 문구는 [Release notes](docs/RELEASE_NOTES_v1.0.0.md), Git 명령과 asset·checksum 절차는 [배포 안내](docs/RELEASING.md)를 참고하세요. `package-lock.json`은 재현 가능한 의존성 설치를 위해 커밋합니다.

## 화면

스크린샷은 추후 추가할 수 있습니다. 공유 전에 Key와 미공개 논문·리뷰 내용이 보이지 않는지 확인하세요.

## 라이선스

기존 `package.json`의 **ISC** 라이선스 표기를 유지하고 [LICENSE](LICENSE)를 추가했습니다. 요청된 기본 MIT 전환은 기존 라이선스를 덮어쓰지 않는 조건에 따라 적용하지 않았습니다. 저작권 이름과 기관명은 추측하지 않았으며 `Copyright (c) 2026`으로 표기했습니다. 외부 패키지와 시스템 폰트는 각자의 라이선스를 따릅니다.

## 참여

버그나 개선사항은 GitHub Issues를 이용해 주세요. API Key, 개인 PDF, 비공개 리뷰 결과를 첨부하지 마세요.
