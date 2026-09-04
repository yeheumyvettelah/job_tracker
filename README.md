# 취업준비 컨트롤보드 (v2 — 양방향 동기화)

Notion의 세 데이터베이스(취업 공고 트래커 / 스킬 개발 트래커 / 개인 일정)를
**읽고 쓰는** 대시보드입니다.

- **읽기**: GitHub Actions가 6시간마다 Notion → `data/*.json`으로 동기화 (여러 기기에서 최신 상태 확인 가능)
- **쓰기**: 공고 카드 드래그(상태 변경), 스킬 체크리스트/진행률/메모, 캘린더 일정 추가·수정·삭제·드래그가
  전부 Cloudflare Worker를 통해 **그 자리에서 바로 Notion에 반영**됩니다 (다음 6시간을 기다릴 필요 없음).

## 왜 Cloudflare Worker가 하나 더 필요한가

이 사이트(GitHub Pages)는 정적 파일이라 Notion 토큰을 직접 담을 수 없습니다(누구나
페이지 소스에서 토큰을 볼 수 있어 위험). 그래서 토큰은 Cloudflare Worker(서버 역할, 무료)에만
저장하고, 웹앱은 이 Worker에 "상태를 검토중으로 바꿔줘" 같은 요청만 보냅니다.

`APP_SECRET`은 아무나 이 Worker를 호출하지 못하도록 거는 최소한의 잠금장치입니다.
다만 이 값도 브라우저 코드에 그대로 들어가므로 완벽한 보안은 아니고, "URL과 코드를
아는 사람만 접근 가능한" 정도의 개인용 보호 수준이라고 생각하시면 됩니다. 더 강한 보안이
필요하면 Cloudflare Access 같은 로그인 계층을 추가로 붙일 수 있는데, 원하시면 다음에
같이 설정해드릴게요.

## 1. Notion 통합(integration) 만들기

1. https://www.notion.so/my-integrations 접속 → **New integration** 클릭
2. 이름은 아무거나 (예: "job-dashboard-sync"), 워크스페이스 선택 후 생성
3. 생성된 **Internal Integration Secret**(토큰)을 복사해둡니다 — 이 토큰은
   **절대 코드나 채팅에 붙여넣지 말고**, 아래 3번 GitHub Secrets에만 등록하세요.
4. Notion에서 "취업 공고 트래커" / "취업 준비 - 스킬 개발 트래커" / "취업 준비 - 개인 일정"
   세 데이터베이스 페이지를 각각 열고, 우측 상단 `•••` → **연결 추가(Add connections)** →
   방금 만든 통합을 연결합니다. (연결을 안 해주면 API가 데이터를 못 읽고 쓰지도 못합니다.)

## 2. GitHub 저장소 만들기

1. 이 폴더(`index.html`, `data/`, `sync/`, `.github/`) 전체를 새 GitHub 저장소에 업로드합니다.
2. 저장소 **Settings → Pages** → Source를 "GitHub Actions" 또는 "Deploy from a branch(main, /root)"로 설정합니다.

## 3. Notion 토큰을 GitHub Secrets에 등록

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `NOTION_TOKEN`, Value: 1번에서 복사한 토큰 붙여넣기 → 저장

## 4. 최초 동기화 실행

1. 저장소 **Actions** 탭 → "Sync Notion data" 워크플로우 선택 → **Run workflow** 클릭
2. 성공하면 `data/jobs.json`, `data/skills.json`이 최신 내용으로 커밋됩니다.
3. 이후에는 6시간마다 자동으로 실행됩니다 (`.github/workflows/sync.yml`의 cron 수정 가능).

## 5. Cloudflare Worker 배포 (쓰기 기능 담당)

1. https://dash.cloudflare.com 가입 (무료)
2. 터미널에서:
   ```
   npm install -g wrangler
   wrangler login
   cd notion-job-dashboard
   wrangler deploy
   ```
3. 배포 후 나오는 주소를 복사 (`https://job-dashboard-api.<계정>.workers.dev` 형태)
4. 아래 두 비밀값 등록:
   ```
   wrangler secret put NOTION_TOKEN
   wrangler secret put APP_SECRET
   ```
   `NOTION_TOKEN`은 1번에서 만든 통합 토큰, `APP_SECRET`은 본인이 정하는 임의의 문자열
   (예: 랜덤 문자열 생성기로 만든 32자 정도) — 이 값을 6번에서 프론트엔드에도 똑같이 넣어줍니다.
5. (선택, 권장) `wrangler.toml`의 `ALLOWED_ORIGIN`을 본인 GitHub Pages 주소로 바꾸고 재배포하면
   다른 사이트에서의 요청을 막을 수 있습니다.

## 6. 프론트엔드에 Worker 주소 연결

`index.html` 맨 위 `CONFIG` 부분을 채웁니다:
```js
const WORKER_URL = "https://job-dashboard-api.<계정>.workers.dev";
const APP_SECRET = "4번에서 정한 값과 동일하게";
```
저장 후 GitHub에 다시 push하면 반영됩니다.

## 7. 대시보드 접속

GitHub Pages 배포가 끝나면 `https://<계정>.github.io/<저장소명>/` 주소로 접속하면 됩니다.
공고 카드를 드래그해서 칸을 옮기거나, 스킬 체크리스트를 수정하거나, 캘린더에 일정을
추가/삭제/드래그하면 바로 Notion에 반영되고, 다른 기기에서 새로고침하면 동일하게 보입니다.

## 다른 Notion DB를 쓰고 싶다면

`sync/fetch_notion.mjs` 상단의 `JOBS_DATA_SOURCE_ID`, `SKILLS_DATA_SOURCE_ID` 값을
원하는 데이터소스 ID로 바꾸면 됩니다. (Notion 페이지 URL이 아니라, Notion API 응답의
데이터소스 ID가 필요합니다 — 모르면 Claude한테 다시 물어보세요.)

## 데이터 흐름 요약

```
                 읽기 (6시간마다, GitHub Actions)
Notion DB  ─────────────────────────────────────►  data/*.json ──► index.html (GitHub Pages)
   ▲                                                                      │
   │                 쓰기 (즉시, 사용자가 조작할 때마다)                    │
   └──────────────────────  Cloudflare Worker  ◄────────────────────────┘
                             (NOTION_TOKEN 보관)
```

- 드래그로 상태를 바꾸거나, 체크리스트/진행률/메모를 고치거나, 캘린더 일정을
  추가·수정·삭제·드래그하면 → 즉시 Worker를 거쳐 Notion에 반영됩니다.
- Cowork 자동화가 Notion에 새 공고를 추가하는 것처럼 "웹앱 밖에서" 생기는 변경은
  다음 6시간 주기 동기화 때 반영됩니다 (급하면 Actions 탭에서 수동 실행).
