# Current State Monetization Audit

Audit date: 2026-05-07  
Scope: current repo state only. No app code was modified for this audit.

## 1. Repo Map

Top-level folders and files:

| Path | Role |
| --- | --- |
| `app/` | Expo Router mobile frontend screens: home, settings, legal, layout/providers. |
| `components/` | Mobile UI components: signal cards, paywall sheet, hero image, Today's Sky, shell/skeleton/background. |
| `hooks/` | Mobile providers/hooks: predictions lifecycle and billing context. |
| `services/` | Mobile services: prediction fetch/merge, AsyncStorage persistence, billing/IAP, analytics, push, crash. |
| `utils/` | Shared mobile utility code: dates, deterministic free category, cosmic metadata, haptics, theme. |
| `content/` | Local rule-based prediction pools for `love`, `career`, `money`, `mood`. |
| `backend/` | Next.js API/backend deployed to Vercel. Stores generated content/control state in Upstash Redis, verifies Play purchases, exposes ops APIs and cron endpoints. |
| `local-worker/` | Node HTTP worker that runs local Ollama generation and writes daily predictions to Upstash Redis. |
| `ops-console/` | Next.js browser console for operators. Talks to backend ops APIs through a local proxy and to the local worker directly. |
| `assets/` | Expo app icons/splash assets. |
| `plugins/` | Expo config plugin for `react-native-iap` Play Store setup. |
| `.github/` | GitHub config/workflows if present. |
| `dist/` | Build output/artifacts. Not app source. |
| `node_modules/` | Installed root dependencies. |
| Root config files | Expo, Metro, Babel, EAS, package lock, env examples, Firebase/FCM config. |

Relevant commands:

| Area | Commands |
| --- | --- |
| Mobile app | `npm start`, `npm run android`, `npm run build:aab`, `npm run build:preview` from repo root. |
| Backend | `cd backend && npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run cron:predictions`. |
| Local worker | `cd local-worker && npm run dev`, `npm start`, `npm run generate`; CLI also supports `node generate.js --force`. |
| Ops console | `cd ops-console && npm run dev`, `npm run build`, `npm run start`; default port is `3400`. |

Current worktree note: before this document, `app/index.js`, `hooks/usePredictions.js`, `backend/pages/api/cron/daily-push.js`, `backend/vercel.json`, and `backend/pages/privacy.js` were already modified/untracked. This audit treats those files as current observed state.

## 2. App Runtime Flow

### App open/init

`app/_layout.js` initializes crash monitoring and analytics, prevents splash auto-hide, configures Android navigation bar, and wraps the app in:

1. `PredictionsProvider` from `hooks/usePredictions.js`.
2. `BillingProvider` from `hooks/useBilling.js` through `BillingBridge`.
3. `AppInner`, which registers push notifications and polls `/api/push/test-command`.

The home screen in `app/index.js` hides the splash once prediction loading completes.

### User/session identification

There is no account login. The client uses an anonymous per-install salt from `services/storageService.js`:

```text
wwht:installSalt
```

`services/predictionEngine.js` sends this salt as `X-Install-Id` to `/api/predictions/daily`. The backend stores it in Redis HyperLogLog keys for total installs and DAU:

```text
wwht:installs:total
wwht:installs:dau:{YYYYMMDD}
```

PostHog events are initialized in `services/analyticsService.js` if `EXPO_PUBLIC_POSTHOG_KEY` exists. Events include `date: getTodayKey()` and `source_app: 'wwht'`.

### Reading fetch/generation

`hooks/usePredictions.js` calls `getPredictions()` from `services/predictionEngine.js`.

`getPredictions()`:

1. Calls `fetchRemotePayload()` with a 4 second timeout against `${EXPO_PUBLIC_API_URL}/api/predictions/daily`.
2. Reads remote `data`, `dateKey`, `generatedAt`, `ruleBucket`, `engineMode`, and `heroImage`.
3. Generates or reads local rule-based predictions through `getTodaysPredictions(ruleBucket)`.
4. If `engineMode === 'rule'`, returns local rule picks only.
5. If `engineMode === 'llm'`, prefers remote LLM data per category and falls back to rule picks where remote categories are missing.
6. If a remote category contains an array of variants, deterministically chooses one by hashing `installSalt|bucket|dateKey|category`.

Local rule picks come from `content/{love,career,money,mood}.js`, avoid recent local IDs for up to 14 shown IDs per category, and are cached in AsyncStorage for the local calendar date.

Backend `/api/predictions/daily` reads:

```text
wwht:predictions:{YYYYMMDD}
wwht:ruleBucket
wwht:heroImage
wwht:engineMode
```

It does not generate content on request; it only serves Redis payload plus control flags.

### Hero image selection

Hero image is ops-controlled, not user-shuffled. `backend/pages/api/ops/hero-image.js` stores one global object at:

```text
wwht:heroImage
```

Shape:

```json
{
  "url": "https://... or data:image/...",
  "alt": "Tarot reader",
  "enabled": true,
  "updatedAt": "ISO timestamp"
}
```

The mobile app renders `<HeroImage source={heroImage?.url} />` only if `/api/predictions/daily` returns an enabled image with a URL. The current mobile component ignores `alt`.

### Today's Sky display

`app/index.js` computes:

```text
getDailyVibe()
getDailyMoment()
getDailyWatchFor()
```

from `utils/freeCategory.js`, then passes them to `components/TodaysSky.js`. `TodaysSky` also uses `getDailyEnergy()` and `getAffectedCategories()` from `utils/cosmic.js`. All values are deterministic for the client local date through `getDailySeed()`.

### Card/signal rendering

The home screen orders categories with `getCategoryOrder(freeCategory)`, placing the daily free category first. Each card is `components/SignalCard.js`.

Prediction object fields rendered by `SignalCard`:

```json
{
  "id": "string",
  "teaser": "string",
  "full": "string",
  "punch": "string optional",
  "action": "string optional",
  "timing": "string optional",
  "shareSnippet": "string optional",
  "source": "rule | llm",
  "variantIndex": "number optional",
  "variantCount": "number optional"
}
```

`SignalCard` calculates `canRead = isFree || isUnlocked`. If readable, tapping expands/collapses the full reading. If locked, tapping the header or footer fires `locked_card_tap` and opens the paywall.

### Reveal button behavior

For readable cards, the visible control is `+`, `-`, or a short reveal animation marker. Tapping expands the card content. This is not a paid reveal transaction; it is an in-card expand/collapse state.

For locked cards, the header shows a `Reveal` badge and the footer says:

```text
See what's predicted →
```

Both open `PaywallSheet`; no ad reveal path exists today.

### Free trial logic

Free window logic lives in `services/storageService.js`:

```text
FREE_WINDOW_DAYS = 3
wwht:firstOpenDate
wwht:day4BannerSeen
```

`getDayNumber()` stores the first open date on first call and returns a 1-based calendar-day difference using local JS `Date`. `isInFreeWindow()` returns true for days 1, 2, and 3. During the free window, `app/index.js` sets `showAll = unlocked || inFreeWindow`, so all four cards are readable.

### Unlock/paywall logic

Unlock state is local-only in AsyncStorage:

```text
wwht:unlockToday
wwht:unlockAll
wwht:unlockAllAt
```

`isUnlocked()` returns true if either today's unlock or 30-day unlock is active. The frontend does not ask the backend for current entitlements.

`components/PaywallSheet.js` presents:

1. Primary: `full_unlock_v1`, copy "30 days of full readings", fallback price `₹49`.
2. Secondary: `daily_unlock_v1`, copy "See today's other 3 events", fallback price `₹29`.
3. Restore purchase link.

`hooks/useBilling.js` and `services/billingService.js` drive Google Play purchase and restore flows.

### Image shuffle behavior

No hero image shuffle behavior is implemented. There are no mobile UI controls, storage keys, backend APIs, product IDs, ad reward flows, or shuffle credits for hero image shuffling. The only hero-image mutation is operator publish/update/remove in ops console.

Current state aligns with the business rule "There is no unlimited hero image shuffle anywhere," but it does not yet implement discrete paid/ad shuffle actions.

### Date rollover behavior

Mobile date keys use local device time from `utils/dateUtils.js`:

```text
getTodayKey() -> YYYYMMDD
getTodayMidnight() -> local device midnight
getTodayLabel() -> en-IN formatted local date label
```

Backend prediction date keys use server runtime local time in several files, without explicit timezone. Push scheduling utilities use `Asia/Kolkata` for push sent keys. This creates mixed timezone behavior:

| Area | Date source |
| --- | --- |
| Mobile reading cache/unlocks/free window/free category | Device local timezone. |
| Backend prediction keys/status/ops today | Server local timezone. On Vercel this is usually UTC unless configured otherwise. |
| Push daily sent key | `Asia/Kolkata` in `backend/lib/push.js`. |

On app foreground after more than 5 seconds, `hooks/usePredictions.js` refreshes remote content silently but does not rerun lifecycle state (`getDayNumber`, `isInFreeWindow`, etc.). A date rollover while the app remains active/backgrounded briefly may not fully recalculate free window and unlock display until a full lifecycle load occurs.

## 3. Data Model and Persistence

### Reading object shape

Backend Redis payload at `wwht:predictions:{YYYYMMDD}`:

```json
{
  "dateKey": "YYYYMMDD",
  "generatedAt": "ISO timestamp",
  "predictions": {
    "love": { "id": "...", "teaser": "...", "full": "...", "punch": "...", "action": "...", "timing": "...", "shareSnippet": "..." },
    "career": {},
    "money": {},
    "mood": {}
  },
  "errors": { "love": "message" },
  "model": "phi3",
  "variantCount": 3,
  "source": "llm"
}
```

`local-worker/generate.js` can store each category as either a single object or an array of up to 8 variants.

Client `getPredictions()` returns:

```json
{
  "predictions": {
    "love": { "id": "...", "teaser": "...", "full": "...", "source": "llm", "variantIndex": 0, "variantCount": 3 }
  },
  "heroImage": null,
  "llmGeneratedAt": "ISO timestamp or null",
  "engineMode": "llm"
}
```

Only `predictions` and `heroImage` are currently stored in provider state.

### Card/signal object shape

Required for rendering:

```text
id
teaser
full
```

Optional but used if present:

```text
punch
action
timing
shareSnippet
source
variantIndex
variantCount
```

Categories are hardcoded as:

```text
love, career, money, mood
```

### Hero image object/selection state

Backend key:

```text
wwht:heroImage
```

Client state:

```text
PredictionsProvider.heroImage
```

Ops console browser draft state:

```text
hero
heroDraft.url
heroUploading
```

No per-user hero selection state exists.

### User/session object

There is no full user object. The app uses:

```text
wwht:installSalt
```

as anonymous install ID. Push registration stores token metadata in Redis:

```text
wwht:pushTokens
wwht:pushMeta:{ExponentPushToken...}
```

Metadata shape:

```json
{
  "token": "ExponentPushToken[...]",
  "platform": "android",
  "appVersion": "1.6.8",
  "lastSeenAt": "ISO timestamp"
}
```

### Entitlement/unlock object

Client-only entitlement state:

| Key | Shape | Meaning |
| --- | --- | --- |
| `wwht:unlockToday` | `{ "dateKey": "YYYYMMDD" }` | `₹29` daily unlock for the client local date. |
| `wwht:unlockAllAt` | timestamp ms string | Start time for 30-day unlock. |
| `wwht:unlockAll` | `'true'` legacy flag | Backward compatibility; migrated to `unlockAllAt` on first read. |

`getUnlockAllInfo()` returns:

```json
{
  "active": true,
  "purchasedAt": 1710000000000,
  "expiresAt": 1712592000000,
  "daysRemaining": 30
}
```

There is no backend entitlement record keyed by install/user.

### Payment/IAP object

Product IDs:

```text
daily_unlock_v1
full_unlock_v1
```

Backend verification request:

```json
{
  "productId": "daily_unlock_v1",
  "purchaseToken": "string",
  "installId": "optional install salt"
}
```

Verification response:

```json
{
  "ok": true,
  "valid": true,
  "productId": "daily_unlock_v1",
  "orderId": "GPA...",
  "purchaseState": 0
}
```

Best-effort purchase audit log:

```text
wwht:purchases
```

Log entry fields:

```text
ts, productId, orderId, purchaseState, installId
```

### Ad/reward object

No ad SDK, rewarded ad object, ad reward token, ad placement ID, banner unit ID, or ad reward persistence exists today.

### AsyncStorage keys

From `services/storageService.js`:

```text
wwht:lastOpened
wwht:todayPredictions
wwht:recentIds:{category}
wwht:unlockToday
wwht:unlockAll
wwht:unlockAllAt
wwht:zodiac
wwht:firstOpenDone
wwht:streakDays
wwht:streakLastDate
wwht:firstOpenDate
wwht:day4BannerSeen
wwht:installSalt
wwht:lastRuleBucket
wwht:lastEngineMode
wwht:pushEnabled
```

Ops console browser localStorage:

```text
wwht-ops-creds
```

### Backend Redis/database keys

Prediction/content/control:

```text
wwht:predictions:{YYYYMMDD}
wwht:ruleBucket
wwht:engineMode
wwht:heroImage
wwht:lastRun:{YYYYMMDD}
wwht:runs
wwht:health
```

Install analytics:

```text
wwht:installs:total
wwht:installs:dau:{YYYYMMDD}
```

Purchases:

```text
wwht:purchases
```

Push:

```text
wwht:pushTokens
wwht:pushMeta:{token}
wwht:pushSchedule
wwht:pushSent:{YYYYMMDD}
wwht:pushLog
```

Push debug/test keys also exist through push debug endpoints.

### Hardcoded constants

| Constant | File | Value |
| --- | --- | --- |
| `FREE_WINDOW_DAYS` | `services/storageService.js` | `3` |
| `UNLOCK_ALL_DAYS` | `services/storageService.js` | `30` |
| `MAX_RECENT` | `services/storageService.js` | `14` |
| Product IDs | `services/billingService.js` | `daily_unlock_v1`, `full_unlock_v1` |
| Fallback prices | `hooks/useBilling.js` | `₹29`, `₹49` |
| Remote prediction timeout | `services/predictionEngine.js` | `4000ms` |
| Backend verification timeout | `services/billingService.js` | `6000ms` |
| Worker generation timeout | `local-worker/generate.js` | `600000ms` |
| Variant cap | `local-worker/generate.js` | `1..8` |
| Categories | Multiple | `love`, `career`, `money`, `mood` |
| Local worker default port | `local-worker/server.js` | `8788` |
| Ops console default port | `ops-console/package.json` | `3400` |
| Backend default URL | `ops-console/lib/api.js` | `https://wwht-backend.vercel.app` |
| Android package | `app.json` | `com.wwht.app` |

## 4. Monetization Current State

### In-app product IDs

Declared in `services/billingService.js`:

```text
daily_unlock_v1
full_unlock_v1
```

Allowed by backend verification in `backend/pages/api/billing/verify.js`.

### Daily unlock implementation status

Implemented locally. `daily_unlock_v1` purchase calls `setUnlockToday()`, which stores:

```json
{ "dateKey": "YYYYMMDD" }
```

at `wwht:unlockToday`. `getUnlockToday()` compares that date to client-local `getTodayKey()`.

Risk: the backend does not maintain or enforce daily entitlement. A user reinstall/device change loses the local daily unlock unless Play restore returns the consumable, which is not reliable for consumed one-time products.

### 30-day unlock implementation status

Implemented locally as a 30-day window. `full_unlock_v1` purchase calls `setUnlockAll()`, which stores `Date.now()` at `wwht:unlockAllAt` and also writes legacy `wwht:unlockAll = 'true'`.

Risk: product copy in `services/billingService.js` still says "unlocks permanently (stored locally)" while current logic is 30 days. The UI copy says 30 days.

### IAP verification flow

`services/billingService.js` initializes `react-native-iap`, listens for purchase updates, and posts purchase tokens to `${EXPO_PUBLIC_API_URL}/api/billing/verify`.

Backend verification:

1. `backend/pages/api/billing/verify.js` validates product ID and token.
2. `backend/lib/playVerify.js` calls Google Play Developer API `purchases.products.get`.
3. Purchase is valid if `purchaseState === 0`.
4. A best-effort audit entry is pushed to `wwht:purchases`.

Client behavior grants on infrastructure failure:

```text
if no backend URL -> trust client
if backend HTTP error -> grant
if verify_unavailable/verify_error -> grant
only explicit valid:false without reason -> reject
```

### Rewarded ad implementation status

Not implemented. There is no SDK dependency, placement ID, UI path, backend reward verification, or local reward state.

### Banner ad implementation status

Not implemented. There is no banner component or ad SDK dependency.

### Mock/stub entitlement logic

There is no explicit mock entitlement switch. However, billing verification has grace behavior that effectively trusts purchases when backend verification is missing or failing.

The entire entitlement model is local AsyncStorage rather than backend-backed.

### Files that currently check payment, unlock, free trial, or reveal state

| File | Current role |
| --- | --- |
| `app/index.js` | Calculates `showAll = unlocked || inFreeWindow`; decides full reveal vs one-free/locked layout; opens paywall on locked card. |
| `hooks/usePredictions.js` | Loads `isUnlocked()`, `getDayNumber()`, `isInFreeWindow()`, and day-4 banner state. |
| `services/storageService.js` | Source of truth for free window, day number, daily unlock, 30-day unlock, cache, date rollover. |
| `components/SignalCard.js` | Computes `canRead = isFree || isUnlocked`; opens/closes readable cards or sends locked taps to paywall. |
| `components/PaywallSheet.js` | Presents purchase options, restore, product IDs, and paywall copy. |
| `hooks/useBilling.js` | IAP init state, purchase start/fail/success tracking, price fallback, restore calls. |
| `services/billingService.js` | Product IDs, Play purchase flow, backend verification, local grant on purchase success. |
| `backend/pages/api/billing/verify.js` | Backend purchase token verification/audit log. |
| `backend/lib/playVerify.js` | Google Play Developer API implementation. |
| `app/settings.js` | Displays unlock status and restore purchase action. |

## 5. Local Worker and Ops Console

### What the local worker generates

`local-worker/generate.js` generates daily predictions for:

```text
love, career, money, mood
```

using local Ollama. It asks for JSON with:

```text
id, teaser, full, punch, action, timing, shareSnippet
```

It can generate multiple variants per category. It strips em/en dashes in strings, repairs some malformed JSON, and writes the result to Upstash Redis.

### How daily readings are generated

The local worker writes:

```text
wwht:predictions:{YYYYMMDD}
```

with a 36 hour TTL. It also writes run records:

```text
wwht:lastRun:{YYYYMMDD}
wwht:runs
```

On successful generation it sets:

```text
wwht:engineMode = llm
```

The older backend job in `backend/jobs/generateDailyPredictions.js` can also generate via Ollama, but this is unsuitable for Vercel-local LLM constraints and has less robust JSON/variant handling than `local-worker/generate.js`.

### Scheduled/manual/on-demand status

Generation is effectively manual or locally scheduled. The local worker exposes:

```text
POST /generate
POST /cancel
GET /status
GET /models
GET /health
```

`backend/pages/api/cron/daily-predictions.js` exists, but its comments state the Vercel cron is disabled because the backend cannot reach local Ollama. `backend/vercel.json` currently schedules only `/api/cron/daily-push`, not daily prediction generation.

### How ops console triggers jobs

`ops-console/pages/index.js` calls `worker.generate()` from `ops-console/lib/api.js`, which posts directly to:

```text
{workerUrl}/generate
Authorization: Bearer {LOCAL_WORKER_KEY}
```

The generate card supports:

```text
Generate (skip if cached)
Force regenerate
Variants per category, 1..8
Model selection from worker /models
Clear backend cache
```

### Admin controls

Ops console currently includes controls for:

| Area | Controls |
| --- | --- |
| Users | Total installs, active today, push opt-in, 7-day DAU. |
| Backend | Health, Redis, OPS_KEY, CRON_SECRET, today ready/generatedAt/categories. |
| Local worker | Online/idle/running status, active job snapshot, model list. |
| Prediction generation | Generate, force regenerate, clear backend cache, choose model, variants per category. |
| Today's predictions | Inspect generated category payloads and errors. |
| LLM run history | Inspect recent worker run records. |
| Rule engine | Bump rule bucket, force LLM mode, force RULE mode. |
| Hero image | Pick local image, resize to JPEG data URL, publish/update/remove global hero. |
| Push notifications | Configure schedule copy/hour/minute/enabled, send one-off push, run registration test, view trace. |

### What happens if local worker is offline

Ops console shows worker offline and generate buttons cannot successfully start jobs. The mobile app still works because `services/predictionEngine.js` falls back to local rule-based predictions when `/api/predictions/daily` is unavailable or has no LLM data. If remote API is available but no LLM data exists, rule picks fill missing categories. Hero image and engine-mode updates may not refresh if backend fetch fails.

### How generated content reaches frontend/backend

1. Local worker generates predictions through Ollama.
2. Worker writes payload to Upstash Redis.
3. Backend `/api/predictions/daily` reads Redis and serves data/control flags.
4. Mobile app fetches `/api/predictions/daily`.
5. Mobile app merges LLM with local rule fallback and renders cards.

## 6. Current UX Behavior

### First-day user

On first launch/day 1:

1. Splash stays until predictions load.
2. Header shows `Today`, date, and a streak badge.
3. Optional hero image appears if ops published one.
4. Badge says `DAY 1 OF 3 · ALL SIGNALS UNLOCKED`.
5. Today's Sky appears.
6. Section label says `TODAY'S FOUR SIGNALS`.
7. All four signal cards are readable and expandable.
8. Footer says `After day 3: ₹29 reveals today · ₹49 reveals 30 days`.

Note: `isFirstEverOpen()` and `markFirstOpenDone()` exist, but the current home screen does not use `isFirstEver` or call `dismissFirstEver()`. First-ever behavior is effectively the same as the 3-day free window.

### Day 1 to day 3 user

The user sees all four cards readable. On day 3 the badge changes to:

```text
FINAL FREE DAY · ALL SIGNALS UNLOCKED
```

The app still shows the same free-window footer about day 3 ending and the `₹29`/`₹49` options.

### Post-free-window user

On day 4+ without unlock:

1. One free category is placed first.
2. Section label says `TODAY'S REVEALED SIGNAL`.
3. Subcopy says `This one found you first.`
4. First card is readable.
5. Remaining three appear under `THREE MORE WAITING TO UNFOLD`.
6. Locked cards show `Reveal` and `See what's predicted →`.
7. Footer says `One signal revealed daily · ₹29 reveals today · ₹49 reveals 30 days`.

On first day after free window, if not dismissed, a transition banner appears:

```text
✦ THE FREE WINDOW IS DONE ✦
Your first 3 days are complete.
From today, one signal stays free.
The rest wait to be revealed.
See today's reading →
```

### Locked card tap

Tapping a locked card:

1. Tracks `locked_card_tap`.
2. Opens `PaywallSheet`.
3. Paywall category hint says `{Category} signal · waiting for you`.
4. Paywall heading says:

```text
One moment was revealed.
The rest is still waiting.
```

5. Paywall subheading says:

```text
Three events haven't happened yet today. See them before they do.
```

There is no rewarded-ad reveal option.

### Hero image shuffled

No user shuffle exists. The only way hero image changes is ops console publish/update/remove. Pull-to-refresh or app foreground refresh can pick up the latest published hero image.

### Copy around free trial completion and locked cards

Free-window badge:

```text
DAY X OF 3 · ALL SIGNALS UNLOCKED
FINAL FREE DAY · ALL SIGNALS UNLOCKED
```

Free-window footer:

```text
After day 3: ₹29 reveals today · ₹49 reveals 30 days
```

Day-4 banner:

```text
THE FREE WINDOW IS DONE
Your first 3 days are complete.
From today, one signal stays free.
The rest wait to be revealed.
See today's reading →
```

Locked daily footer:

```text
One signal revealed daily · ₹29 reveals today · ₹49 reveals 30 days
```

Paywall:

```text
30 days of full readings
Every event, every day · just ₹1.6/day
See today's other 3 events
Reveals the rest of today's reading
One-time payment via Google Play · No auto-renewal · Cancel anytime
Razor-sharp daily readings, drawn fresh at midnight
```

## 7. Gaps and Risks

### Missing implementation for agreed monetization plan

Implemented:

```text
3-day free window
one free card after free window
locked remaining cards
₹29 today unlock
₹49 30-day unlock
restore purchase UI/path
no unlimited hero shuffles
```

Missing:

```text
rewarded ad reveal one card
rewarded/paid hero shuffle action
shuffle cap/credit state
banner ads
backend-backed entitlements
robust purchase restore for consumables
server/client timezone alignment
ad reward fraud prevention
```

### Duplicate or conflicting unlock logic

Unlock logic is concentrated in `services/storageService.js`, but copy is inconsistent:

| Location | Conflict |
| --- | --- |
| `services/billingService.js` header | Says `full_unlock_v1` unlocks permanently. Actual logic is 30 days. |
| `app/settings.js` | Row label says `30-day full unlock`, but if daily unlock is active the status text still appears under that row. |
| `PaywallSheet` legal | Says readings are "drawn fresh at midnight", but actual content date may be backend/server timezone, local worker run time, or local rule fallback. |

### Frontend/backend entitlement mismatch

Backend verifies purchases and logs purchase entries, but frontend entitlements are granted and enforced entirely on-device. The backend does not issue entitlement records or a signed entitlement response. Any local storage loss, reinstall, app data clear, clock manipulation, or restore failure can change unlock state.

### Local-only state that should be backend-backed

Candidates:

```text
daily unlock
30-day unlock
rewarded ad reveal grants
shuffle credits/actions
per-day revealed-card state, if ad reveals should persist
purchase restore mapping from order/token to install/user
```

### Date rollover risks

1. Client uses device local timezone for unlock/free-window/cache.
2. Backend predictions use server local timezone.
3. Push uses `Asia/Kolkata`.
4. Lifecycle refresh is skipped on foreground silent refresh.
5. User device clock changes can extend or shorten local unlock/free-window state.

### Payment restore risks

Both products are treated as consumables with `finishTransaction({ isConsumable: true })`. `getAvailablePurchases()` is not a reliable restore mechanism for consumed products. Daily unlock restore can incorrectly apply to the current date because restore calls `setUnlockToday()` with today's client date rather than the original purchase date. Full unlock restore starts a fresh 30-day window from restore time, not original purchase time.

### Ad reward fraud or failure risks

No ad implementation exists. When added, risks to handle include:

```text
client-only reward grant spoofing
ad watched but reward callback failed
duplicate reward callbacks
offline reward persistence
per-card/per-day idempotency
reward consumed on date rollover
ad SDK unavailable/no fill
paid unlock racing with ad reward
```

### UI confusion risks

1. `Reveal` on locked cards means "open paywall," while `+` on free cards reveals content. Users may expect one tap to reveal locked content directly.
2. Paywall primary copy says "Every event, every day" but future shuffle rules must not imply unlimited shuffles.
3. No ad option is visible despite the business rule allowing rewarded ad reveals.
4. Settings labels combine daily and 30-day unlock status in one row.
5. Day-4 banner can appear every day after day 4 until dismissed, because the key only tracks dismissal, not a specific day.

### Files likely to need changes

High-likelihood files:

```text
app/index.js
hooks/usePredictions.js
services/storageService.js
components/SignalCard.js
components/PaywallSheet.js
hooks/useBilling.js
services/billingService.js
app/settings.js
services/analyticsService.js
services/predictionEngine.js
backend/pages/api/billing/verify.js
backend/lib/playVerify.js
backend/pages/api/predictions/daily.js
backend/pages/api/ops/status.js
ops-console/pages/index.js
ops-console/lib/api.js
```

New files likely needed:

```text
services/adService.js
components/BannerAd.js
backend/pages/api/entitlements/*
backend/pages/api/ads/reward/*
backend/lib/entitlements.js
backend/lib/date.js
```

## 8. Implementation Map

| Feature | Current status | Files involved | Required change | Risk level |
| --- | --- | --- | --- | --- |
| 3-day free window | Implemented locally by `FIRST_OPEN_DATE` and `FREE_WINDOW_DAYS = 3`. | `services/storageService.js`, `hooks/usePredictions.js`, `app/index.js` | Align timezone/date source; consider backend-backed install lifecycle if abuse matters. | Medium |
| One free card after free window | Implemented with deterministic `getDailyFreeCategory()` and category ordering. | `utils/freeCategory.js`, `app/index.js`, `components/SignalCard.js` | Persist/track the daily free category if backend needs analytics/enforcement; ensure it does not shift across timezone changes. | Medium |
| Locked remaining cards | Implemented after day 3 when not unlocked. | `app/index.js`, `components/SignalCard.js`, `components/PaywallSheet.js` | Add ad reveal and per-card reveal state so lock does not only mean purchase. | Medium |
| Rewarded ad reveal one card | Not implemented. | New ad service/UI; likely `SignalCard`, `PaywallSheet`, `storageService`, backend reward APIs. | Add rewarded ad SDK, placement IDs, reward callbacks, per-day/per-category grant storage, analytics, fallback/no-fill UX, fraud controls. | High |
| ₹29 unlock today | Implemented client-side with `daily_unlock_v1`. | `services/billingService.js`, `hooks/useBilling.js`, `PaywallSheet`, `storageService`, `backend/pages/api/billing/verify.js` | Backend-backed entitlement recommended; fix restore behavior for daily consumable; align date timezone. | High |
| ₹49 unlock 30 days | Implemented client-side with `full_unlock_v1` for 30 days. | Same billing/storage files plus `app/settings.js` | Fix stale "permanent" comment/copy; backend entitlement and restore based on verified purchase/order time. | High |
| Hero image shuffle cap | Not implemented; no user shuffle exists. | `components/HeroImage.js`, `app/index.js`, `storageService`, backend/ops hero APIs likely. | Define per-day shuffle credit/action model; store count/credits; enforce no unlimited shuffles. | Medium |
| Paid/ad shuffle action | Not implemented. | New product/ad flow; `HeroImage`, `PaywallSheet` or new modal, billing/ad services. | Add discrete action: one rewarded ad or one paid shuffle credit. Paid plans must not grant unlimited shuffles. | High |
| No unlimited shuffles | Currently true by absence of shuffle feature. | N/A now. | Preserve explicitly in future entitlement checks and copy; do not bundle unlimited shuffle into `full_unlock_v1`. | Medium |
| Non-invasive banner ad | Not implemented. | New `BannerAd` component/service, likely `app/index.js`. | Add banner SDK/unit, placement that does not crowd reading; hide or soften during paid unlock if desired by business rules. | Medium |
| Restore purchases | Implemented but weak for consumables. | `services/billingService.js`, `hooks/useBilling.js`, `app/settings.js`, `PaywallSheet` | Move to backend entitlement ledger or non-consumable/subscription semantics; restore original entitlement windows, not fresh local grants. | High |
| Date rollover | Partially implemented locally; inconsistent timezone. | `utils/dateUtils.js`, `storageService`, `predictionEngine`, backend date helpers, push helpers. | Create one shared business timezone/date-key policy; refresh lifecycle on app foreground/date change; use timezone-explicit backend keys. | High |
| Ops generation | Implemented manual/local-worker flow; backend cron generation not scheduled. | `local-worker/*`, `ops-console/*`, `backend/pages/api/ops/*`, `backend/pages/api/predictions/daily.js` | Add real local scheduled task if daily automation is required; expose worker failure alerts/status; avoid relying on stale cache. | Medium |

