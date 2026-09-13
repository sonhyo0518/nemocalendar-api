# NemoCalendar Backend

NemoCalendar의 Express + TypeScript API 서버입니다. Google OAuth 로그인, Google Calendar 연동, 할 일, 핀·북마크·기념일, 배너 업로드를 제공합니다.

기본 주소: `http://localhost:5000`

## 기술 스택

- Node.js, Express 5, TypeScript
- Prisma + MySQL (`nemocalendar`)
- Google OAuth 2.0, Google Calendar API
- JWT 인증 (access + refresh)
- Cloudflare R2 (배너 이미지, S3 호환 API), multer
- helmet, express-rate-limit, cors

## 사전 준비

- Node.js
- MySQL (`nemocalendar` 데이터베이스)
- Google Cloud OAuth 클라이언트 (로그인 / 캘린더 스코프)
- Cloudflare R2 (배너 업로드 시, 선택)

## 시작하기

```bash
npm install
npx prisma generate
npm run db:migrate
npm run dev
```

서버가 뜨면 `http://localhost:5000` 에서 `Hello, TypeScript with Express!` 를 확인할 수 있습니다.

빈 DB라면 `db:migrate`가 `prisma/migrations`의 SQL을 적용합니다. 이미 스키마가 있는 DB(예: 기존 TiDB)는 baseline이 `resolve --applied`된 상태여야 하며, `npm run db:status`로 확인합니다.

### 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (`tsx watch`) |
| `npm run build` | TypeScript 빌드 (`dist/`) |
| `npm start` | 빌드된 서버 실행 |
| `npm run db:migrate` | pending migration 적용 (`migrate deploy`) |
| `npm run db:migrate:dev` | 스키마 변경 → migration 생성·적용 (로컬) |
| `npm run db:status` | migration 상태 |
| `npm run db:generate` | Prisma Client 생성 |

## 환경 변수

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 채웁니다. 예시는 `.env.example`을 참고하세요.

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/nemocalendar"

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="postmessage"

JWT_SECRET=""

# Google refresh token 암호화 (32바이트 hex)
TOKEN_ENCRYPTION_KEY=""

CORS_ORIGINS="http://localhost:3000"
PORT=5000

# WeatherAPI.com (날씨 위젯)
WEATHER_API_KEY=""

# Cloudflare R2 (배너 이미지)
R2_ACCOUNT_ID=""
R2_BUCKET_NAME=""
R2_PUBLIC_BASE_URL=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
```

## Prisma

스키마 소스는 `prisma/schema.prisma`이며, 변경은 **migration**으로만 반영합니다. (`db push`는 사용하지 않음)

```bash
# 로컬에서 스키마 수정 후
npm run db:migrate:dev -- --name add_something

# 공유/프로덕션 DB
npm run db:migrate          # migrate deploy
npm run db:status

npx prisma generate         # 또는 npm run db:generate
```

일회성 introspect가 필요할 때만 `npx prisma db pull`을 쓰고, 결과는 리뷰 후 migration으로 정리합니다.

주요 모델: `users`, `todos`, `todo_categories`, `pins`, `anniversaries`, `bookmarks`, `bookmark_folders`

## 인증

보호된 API는 httpOnly 쿠키(`accessToken`) 또는 `Authorization: Bearer <accessToken>` 헤더로 인증합니다.

1. `POST /api/user/google-login` 에 Google authorization `code`를 보냅니다.
2. 응답과 함께 JWT가 **httpOnly 쿠키**(`accessToken`, `refreshToken`)로 설정됩니다.
3. access token 만료 시 `POST /api/user/refresh` 로 쿠키를 갱신합니다. (쿠키 또는 body `{ "refreshToken": "..." }`)
4. `POST /api/user/logout` 으로 쿠키를 삭제합니다.
5. Google Calendar를 쓰려면 `POST /api/user/connect-calendar` 로 Google refresh token을 저장합니다. DB에는 `TOKEN_ENCRYPTION_KEY`로 AES-256-GCM 암호화됩니다.

- Access token: **1시간**
- Refresh token: **7일** (갱신 시 rotation)

캘린더 권한이 없으면 `403`과 `code: "NEEDS_CALENDAR_CONSENT"` 가 반환됩니다.

## API

### User `/api/user`

| Method | Path | Auth | 설명 |
| --- | --- | --- | --- |
| POST | `/google-login` | 없음 | Google 로그인. body: `{ "code": "..." }` → JWT 쿠키 설정 |
| POST | `/refresh` | 없음 | JWT 갱신. 쿠키 또는 body: `{ "refreshToken": "..." }` |
| POST | `/logout` | 없음 | 로그아웃. JWT 쿠키 삭제 |
| GET | `/me` | 필요 | 현재 사용자 |
| POST | `/connect-calendar` | 필요 | Google Calendar 연결. body: `{ "code": "..." }` |
| POST | `/disconnect-calendar` | 필요 | Google Calendar 연결 해제 |
| PATCH | `/location` | 필요 | 날씨 위치 저장 |
| PATCH | `/theme-color` | 필요 | 배너 테마 색상 |
| POST | `/banner` | 필요 | 배너 이미지 업로드 (multipart) |
| DELETE | `/banner` | 필요 | 배너 이미지 삭제 |

### Calendar `/api/calendar`

모두 인증 필요. Google Calendar refresh token이 있어야 합니다.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/calendars` | 연결된 캘린더 목록 |
| GET | `/events` | `?from=yyyy-mm-dd&to=yyyy-mm-dd` 일정 조회 |
| POST | `/events` | 이벤트 생성 |
| PATCH | `/events` | 이벤트 수정 |
| DELETE | `/events` | 이벤트 삭제 |

### Pins `/api/pins`

모두 인증 필요.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/` | 핀 목록 `{ pins: [{ id, text }] }` |
| POST | `/` | 생성. body: `{ "text": "..." }` |
| PATCH | `/:id` | 수정. body: `{ "text": "..." }` |
| DELETE | `/:id` | 삭제 |

### Todo categories `/api/todo-categories`

모두 인증 필요. 목록이 비어 있으면 기본 카테고리 `기타`가 만들어집니다. 마지막 카테고리는 삭제할 수 없습니다.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/` | 카테고리 목록 |
| POST | `/` | 생성. body: `{ "name", "color" }` |
| PATCH | `/:id` | 수정. body: `{ "name?", "color?" }` |
| DELETE | `/:id` | 삭제 |

### Todos `/api/todos`

모두 인증 필요.

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/` | 할 일 목록 |
| POST | `/` | 생성 |
| PATCH | `/:id` | 수정 |
| DELETE | `/:id` | 삭제 |

생성/수정 body 예시:

```json
{
  "title": "과제 제출",
  "categoryId": "1",
  "due": "2026-08-20",
  "status": "todo",
  "priority": "medium"
}
```

- `status`: `todo` \| `in-progress` \| `done`
- `priority`: `high` \| `medium` \| `low`

### Anniversaries `/api/anniversaries`

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/` | 기념일 목록 |
| POST | `/` | 생성 |
| PATCH | `/:id` | 수정 |
| DELETE | `/:id` | 삭제 |

### Bookmarks `/api/bookmarks`

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/` | 북마크 목록 |
| POST | `/` | 생성 |
| PATCH | `/:id` | 수정 |
| DELETE | `/:id` | 삭제 |

### Bookmark folders `/api/bookmark-folders`

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/` | 폴더 목록 |
| POST | `/` | 생성 |
| PATCH | `/:id` | 수정 |
| DELETE | `/:id` | 삭제 |

### Weather `/api/weather`

WeatherAPI.com 프록시. `WEATHER_API_KEY` 필요. in-memory 캐시(fresh 2h / stale 24h).

| Method | Path | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/` | 필요 | 날씨 조회. `?city=...` |
| GET | `/suggest` | 필요 | 지역 자동완성. `?q=...` |
| GET | `/guest` | 없음 | 비로그인용 서울 날씨 |

## 프로젝트 구조

```
src/
  index.ts                 # 서버 진입점
  lib/prisma.ts            # Prisma 싱글톤
  lib/auth-cookies.ts      # httpOnly JWT 쿠키
  lib/token-crypto.ts      # Google refresh token 암호화
  lib/r2.ts                # Cloudflare R2 업로드
  middleware/auth.ts       # JWT 미들웨어 (쿠키 / Bearer)
  middleware/rate-limit.ts # rate limiter
  route/                   # Express 라우터
  controller/              # 비즈니스 로직
  utils/date-key.ts        # 날짜 키 유틸
  generated/prisma/        # prisma generate 결과
prisma/
  schema.prisma
  migrations/              # Prisma Migrate (baseline: 0_init)
```

## 버전·릴리즈

앱 버전은 frontend와 동일한 SemVer를 씁니다. Changelog·태그 규칙의 canonical 문서는 frontend 레포에 있습니다.

→ [RELEASE.md](./RELEASE.md)

## 의존성

패키지 목록은 `package.json`을 기준으로 설치하세요.

```bash
npm install
```
