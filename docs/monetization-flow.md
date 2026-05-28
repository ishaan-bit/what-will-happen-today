# Monetization Flow

## Production Safety

- Existing one-hero ops remains supported through `backend/pages/api/ops/hero-image.js`, `ops-console` "Hero Image (top of UI)", and Redis key `wwht:heroImage`.
- Daily hero batch is additive. It uses new routes and keys only:
  - `wwht:heroPool:{YYYYMMDD}`
  - `wwht:heroBatchAsset:{YYYYMMDD}:{assetId}`
- Notification routes, UI, Redis keys, and mobile registration remain untouched:
  - `/api/ops/push`, `/api/ops/push/schedule`, `/api/ops/push/send-now`, `/api/ops/push-test`
  - `/api/push/register`, `/api/push/unregister`, `/api/push/test-command`, `/api/push/debug`
  - `wwht:pushTokens`, `wwht:pushMeta:*`, `wwht:pushSchedule`, `wwht:pushLog`
- Local worker routes and ops-console worker actions remain untouched:
  - `GET /health`, `GET /status`, `GET /models`, `POST /generate`, `POST /cancel`
- Fallback order for hero images:
  1. Valid daily hero batch for today.
  2. Deterministic per-install assignment from that batch, up to 4 images.
  3. Legacy `wwht:heroImage` if the batch is empty or has fewer than 4 valid images.
  4. Bundled app fallback image only for failure states.
- Backcompat field behavior:
  - `/api/predictions/daily.heroImage` remains the legacy one-hero value for existing production app builds.
  - New app builds read `/api/predictions/daily.heroPool` for batch assignment.

## Existing Systems Reused

- Mobile app: Expo Router, AsyncStorage, PostHog, `react-native-iap`.
- Backend: Next.js API on Vercel with Upstash Redis.
- Ops console: local Next.js console proxying `/api/backend/ops/*` with `OPS_KEY`.
- Billing product IDs already present in the repo:
  - `daily_unlock_v1` for INR 29 today unlock.
  - `full_unlock_v1` for INR 49 30-day unlock.

## Daily Hero Batch

Run the ops console:

```powershell
cd ops-console
npm run dev
```

Open `http://localhost:3400`, then use **Daily Hero Batch**.

Batch options:

- Select multiple local images.
- Select a folder of local images.
- Register a public `https://` image URL manually.

Each image supports:

- title/name
- tags
- readerMood
- headline
- CTA
- weight
- active
- storeSafe
- default/fallback

Local upload mode:

- The console resizes each selected image in the browser.
- Each image is uploaded one at a time to `/api/ops/hero-batch-upload`.
- The backend stores the image in namespaced Redis asset keys.
- The app receives backend image URLs like `/api/hero-batch/image?date=YYYYMMDD&id=asset_x`.

Production storage note:

- Redis upload mode is suitable for small daily batches and keeps the production app fetchable without an AAB rebuild.
- For larger or long-term production use, store images in R2/S3/Cloudinary/CDN and register public URLs in the same batch UI.
- The old one-hero data URL uploader remains available and writes only `wwht:heroImage`.

## Per-User Hero Assignment

- `/api/predictions/daily` receives `X-Install-Id`.
- The backend deterministically assigns up to 4 active, storeSafe images from the day batch using install id, date, and batch revision.
- Same install/date/revision gets the same images and order.
- Different installs get different combinations where the batch has enough images.
- If fewer than 4 active batch images exist, the legacy one-hero image is appended as fallback.
- The app caches the assigned set locally for the day.
- App resume and pull-to-refresh re-fetch backend metadata. If the batch revision changes, hero shuffle state is reset to the new finite set.

## Hero Shuffle Rules

- The 4 assigned heroes are the full daily set.
- Shuffle moves to the next unseen assigned hero.
- No unlimited shuffle exists for free or paid users.
- Paid entitlement removes ad friction only; it does not remove the finite set cap.
- When the set is exhausted, the app shows: "Today's hero set is complete."
- Card reading generation/content logic is not part of hero shuffle.

## Rewarded Ads

Library choice:

- `react-native-google-mobile-ads` is used because it has Android rewarded ads and an Expo config plugin.
- Official docs note that the package requires native config and is not supported in Expo Go.
- Official docs also specify that rewarded access should come from `RewardedAdEventType.EARNED_REWARD`.

Native/EAS requirements:

- `app.config.js` injects the Google Mobile Ads config plugin.
- `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID` should be set for production builds.
- Dev/test builds can opt into Google sample app ids with `EXPO_PUBLIC_ADMOB_TEST_MODE=true`; production builds must provide the real app id.
- A new native build is required after adding the plugin.

Reward unit env vars:

- `EXPO_PUBLIC_ADMOB_REWARDED_SIGNAL_UNIT_ID`
- `EXPO_PUBLIC_ADMOB_REWARDED_DEEPER_UNIT_ID`
- `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_HERO_UNIT_ID` for Android hero shuffle rewarded ads
- `EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID` remains a compatibility fallback for existing builds
- Production GitHub Actions must set `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_HERO_UNIT_ID` or the legacy fallback `EXPO_PUBLIC_ADMOB_REWARDED_HERO_UNIT_ID`.

Mock mode:

- `EXPO_PUBLIC_REWARDED_AD_MOCK=true` explicitly enables local/dev mock rewards.
- `EXPO_PUBLIC_ADMOB_TEST_MODE=true` uses Google rewarded test units for dev/internal test builds.
- Default is false.
- Production never grants a reward unless the native SDK emits the earned-reward callback.

Tracked generic rewarded-ad events:

- `rewarded_ad_requested`
- `rewarded_ad_loaded`
- `rewarded_ad_opened`
- `rewarded_ad_earned`
- `rewarded_ad_closed`
- `rewarded_ad_failed`
- `reward_granted`
- `reward_denied`

Placement-specific events are still tracked by the UI:

- hero shuffle ad events
- locked signal ad events
- deeper meaning ad events

## Break-Even Analytics

PostHog events include:

- `hero_pool_loaded`, `hero_impression`, `hero_shuffle_tap`, `hero_shuffle_ad_started`, `hero_shuffle_ad_completed`, `hero_image_changed`
- `first_signal_cta_tap`, `free_signal_revealed`, `locked_signal_tap`, `locked_signal_ad_started`, `locked_signal_ad_completed`
- `deeper_meaning_tap`, `deeper_meaning_ad_started`, `deeper_meaning_ad_completed`
- `paywall_viewed`, `purchase_tap_29`, `purchase_success_29`, `purchase_failed_29`, `purchase_tap_49`, `purchase_success_49`, `purchase_failed_49`
- `entitlement_active`, `entitlement_expired`

Useful properties include hero image id, tags, reader mood, card id/category/position, user day number, entitlement state, ad placement, and source campaign when supplied in ops.

## Manual QA Checklist

- Existing one-hero update still works from the old Hero Image card.
- Existing notification controls still load, save schedule, send now, and run test registration.
- Local worker card still shows health, model list, generation, force generation, and cancel.
- Daily batch upload works with 3 local images.
- Daily batch upload works with 10 local images.
- Daily batch public URL registration works.
- User A gets a stable 4-image assignment after app refresh/restart.
- User B gets a different assignment when the batch has enough images.
- App refresh/resume picks up changed batch revision without app kill.
- Legacy one-hero fallback appears when the batch is empty.
- Shuffle walks through the finite assigned set.
- Exhausted shuffle shows "Today's hero set is complete."
- `EXPO_PUBLIC_REWARDED_AD_MOCK=true` grants rewards only through the mock service path.
- `EXPO_PUBLIC_REWARDED_AD_MOCK=false` with no native SDK callback denies reward.
- Production no reward occurs without `rewarded_ad_earned`.

## Troubleshooting

Hero image not updating on phone:

- Pull to refresh or foreground the app for more than 5 seconds.
- Check `/api/predictions/daily` returns the expected `heroPool.revision`.
- Check the image has `active=true` and `storeSafe=true`.

Stale cache:

- Batch revision changes reset daily hero shuffle state.
- If the same revision is republished with identical metadata, the local assignment may remain unchanged.

Local upload failing:

- The backend rejects oversized resized data URLs.
- Lower image size/quality or use public CDN URLs.
- Check `HERO_BATCH_UPLOAD_MAX_BYTES` if you intentionally need larger Redis-backed uploads.

Public URL versus stored upload:

- Public URLs are the preferred production path.
- Stored upload URLs are backend-served Redis assets and are useful for small batches.

Ops console tied to production:

- Confirm the backend URL at login or via `WWHT_BACKEND_URL`.
- The console proxy sends `X-Ops-Key` server-side; the key is not exposed to the browser.

Local worker already running:

- Default worker URL is `http://localhost:8788`.
- If the worker card is offline, check `local-worker/.env` for `LOCAL_WORKER_KEY`.

Notification controls regression check:

- Verify token count loads.
- Save schedule.
- Send a one-off push.
- Run test registration and confirm `/api/push/debug` traces update.

## Sources

- React Native Google Mobile Ads docs: https://docs.page/invertase/react-native-google-mobile-ads
- Rewarded ads docs: https://docs.page/invertase/react-native-google-mobile-ads/displaying-ads
