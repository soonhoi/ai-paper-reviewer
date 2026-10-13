# GitHub 배포 절차

## 저장소 생성과 최초 commit

현재 작업 폴더는 아직 Git 저장소가 아닙니다. GitHub에서 빈 저장소를 생성하고 실제 URL을 확인한 후 다음 명령을 실행합니다. `YOUR_REPOSITORY_URL`은 생성한 실제 URL로 교체하세요.

```sh
git init
git branch -M main
git add .
git status --short
git diff --cached --stat
git ls-files .env papers output work release node_modules
# 민감 정보와 실제 PDF가 없는지 확인 후:
git commit -m "Prepare AI Paper Reviewer v1.0.0"
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

`papers/.gitkeep`만 출력되는 것은 정상입니다. `.gitignore`는 이미 추적된 파일을 자동으로 제거하지 않습니다. 기존 저장소에서 민감 파일이 추적되고 있다면 먼저 추적과 이전 이력을 별도로 점검하세요. 실제 secret이 이미 공개된 경우에는 삭제만으로 해결되지 않으며 해당 Key를 폐기·교체해야 합니다.

## 배포 전 확인

```sh
npm install
npm test
npm run build
npm run dist:win
git status --short
```

- README, LICENSE, Release notes와 `package.json`의 version/productName을 확인합니다.
- `.env`, 실제 API Key, 개인 절대 경로, 사용자 PDF와 생성된 리뷰·embedding cache가 staging 대상에 없는지 확인합니다.
- 소스와 `package-lock.json`은 커밋하고 `node_modules/`, `release/`, `dist*/`, `papers/`의 실제 파일, `work/`, `output/`, `tmp/`는 커밋하지 않습니다.
- 설치 파일을 갱신했다면 SHA-256도 다시 생성합니다.

PowerShell:

```powershell
$asset = 'release/AI Paper Reviewer Setup 1.0.0.exe'
$hash = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  AI Paper Reviewer Setup 1.0.0.exe" | Set-Content -LiteralPath 'release/SHA256SUMS.txt' -Encoding ascii
```

## v1.0.0 Release 생성

1. 배포할 소스 commit을 push합니다.
2. GitHub 저장소의 **Releases → Draft a new release**로 이동합니다.
3. tag를 `v1.0.0`으로 지정하고 배포할 commit/main을 선택합니다.
4. 제목은 `AI Paper Reviewer v1.0.0`으로 입력합니다.
5. `docs/RELEASE_NOTES_v1.0.0.md`의 내용을 본문에 복사합니다.
6. `release/AI Paper Reviewer Setup 1.0.0.exe`와 `release/SHA256SUMS.txt`를 asset으로 첨부합니다. blockmap은 선택 사항입니다.
7. 검증 범위와 개발 배포 상태에 맞게 prerelease 여부를 선택하고 내용을 확인한 뒤 게시합니다.
8. README에 실제 저장소의 Release URL을 추가합니다.

소스 공개나 Release 게시를 대신 수행하는 자동 명령은 추가하지 않았습니다. 이번 작업에서는 실제 commit, push, GitHub Release 게시를 수행하지 않습니다.
