# Hero Batch Diagnostics — Validation Guide

## Overview
Diagnostic logging has been added to track why batch hero images are being dropped from the `/api/predictions/daily` endpoint.

### Instrumented Files
- **backend/lib/heroPool.js** — Image normalization and filtering
- **backend/pages/api/predictions/daily.js** — Request flow and decisions

### Diagnostic Points

#### 1. `normalizeHeroImage()` - URL Validation
Logs when an image URL fails validation:
```
[HeroPool.normalizeHeroImage] REJECTED: Invalid URL format for "Batch hero 1"
  {
    index: 0,
    title: "Batch hero 1",
    urlPrefix: "https://cdn.example.com/wwht/...",
    urlLength: 145,
    allowData: false,
    hasHttps: true,
    hasHttp: false
  }
```

#### 2. `normalizeHeroPool()` - Pool Normalization
Logs image count before/after normalization:
```
[HeroPool.normalizeHeroPool] Pool normalized for 20260527
  {
    inputCount: 3,
    normalizedCount: 2,
    droppedByNormalization: 1
  }
```

#### 3. `getServableHeroPool()` - Filtering
Logs each image that passes or fails filtering:
```
[HeroPool.getServableHeroPool] DROPPED: "Batch hero 2"
  {
    id: "hero_20260527_2_abc123",
    title: "Batch hero 2",
    active: true,
    enabled: true,
    storeSafe: false,
    urlPrefix: "https://cdn.example.com/wwht/batch-2.jpg",
    urlOk: true,
    activeOk: true,
    enabledOk: true,
    safeOk: false,
    reason: "storeSafe_false"
  }

[HeroPool.getServableHeroPool] PASS: "Batch hero 1"
  {
    id: "hero_20260527_1_abc123",
    active: true,
    enabled: true,
    storeSafe: true
  }

[HeroPool.getServableHeroPool] Filter complete for 20260527
  {
    inputCount: 3,
    filteredCount: 1,
    dropped: 2
  }

[HeroPool.getServableHeroPool] EMPTY RESULT: All 3 images dropped
```

#### 4. `/api/predictions/daily` - Full Flow
Logs Redis fetch, pool status, and final decision:
```
[/api/predictions/daily] START: dateKey=20260527

[/api/predictions/daily] Redis keys:
  {
    legacy: "wwht:heroImage",
    pool: "wwht:heroPool:20260527"
  }

[/api/predictions/daily] Redis fetch results:
  {
    hasPredictions: true,
    hasBucket: false,
    hasLegacyHero: false,
    hasHeroPool: true
  }

[/api/predictions/daily] Pool status:
  {
    storedPoolImages: 0,
    legacyPoolImages: 0,
    storedPoolNull: true,
    legacyPoolNull: true
  }

[/api/predictions/daily] FINAL HERO DECISION:
  {
    hasAssignedPool: false,
    usedLegacyFallback: true,
    heroPoolImages: 0,
    reason: "stored_pool_null (fallback to legacy)"
  }

[/api/predictions/daily] RESPONSE:
  {
    heroImagePresent: false,
    heroPoolPresent: false,
    heroPoolImageCount: 0
  }
```

---

## Validation Steps

### Step 1: Enable Diagnostics
Export the debug flag before running:
```bash
export DEBUG_HERO_POOL=true
# Or in PowerShell:
$env:DEBUG_HERO_POOL='true'
```

### Step 2: Start Backend (Local Development)
```bash
cd backend
npm run dev
```

### Step 3: Upload Batch Images (via Ops Console)
1. Open http://localhost:3000/ops (or your ops console URL)
2. Select **Hero Batch Upload**
3. Upload 2-3 test images (JPG/PNG)
4. Verify upload succeeds
5. Click **Publish daily pool**

### Step 4: Call Predictions Endpoint
```bash
curl -s "http://localhost:3000/api/predictions/daily" \
  -H "X-Install-Id: test-install-123" | jq .
```

### Step 5: Check Backend Logs
Watch the terminal where backend is running. You should see:
- Image URL validation results (pass/fail)
- Pool normalization counts
- Filtering results per image
- Final decision (batch vs legacy)

---

## Expected Diagnostic Output Scenarios

### ✅ Success Case (Batch Images Served)
```
[HeroPool.normalizeHeroPool] Pool normalized for 20260527
  { inputCount: 3, normalizedCount: 3, droppedByNormalization: 0 }

[HeroPool.getServableHeroPool] PASS: "Batch hero 1"
[HeroPool.getServableHeroPool] PASS: "Batch hero 2"
[HeroPool.getServableHeroPool] PASS: "Batch hero 3"

[HeroPool.getServableHeroPool] Filter complete for 20260527
  { inputCount: 3, filteredCount: 3, dropped: 0 }

[/api/predictions/daily] FINAL HERO DECISION:
  {
    hasAssignedPool: true,
    usedLegacyFallback: false,
    heroPoolImages: 4,
    reason: "using_stored_pool"
  }
```

### ❌ Failure Case 1 (All Images Dropped by Filter)
```
[HeroPool.getServableHeroPool] DROPPED: "Batch hero 1"
  { reason: "storeSafe_false", ... }

[HeroPool.getServableHeroPool] DROPPED: "Batch hero 2"
  { reason: "active_false", ... }

[HeroPool.getServableHeroPool] DROPPED: "Batch hero 3"
  { reason: "invalid_url", ... }

[HeroPool.getServableHeroPool] EMPTY RESULT: All 3 images dropped

[/api/predictions/daily] FINAL HERO DECISION:
  {
    reason: "stored_pool_null (fallback to legacy)"
  }
```

### ❌ Failure Case 2 (Images Dropped by Normalization)
```
[HeroPool.normalizeHeroImage] REJECTED: Invalid URL format for "Batch hero 1"
  { urlPrefix: "data:image/...", reason: "invalid_url" }

[HeroPool.normalizeHeroPool] Pool normalized for 20260527
  { inputCount: 3, normalizedCount: 0, droppedByNormalization: 3 }
```

---

## Interpreting Results

After running the validation, look for:

1. **Which stage drops images?**
   - Normalization → Issue with URL format at upload time
   - Filtering → Issue with active/enabled/storeSafe flags

2. **What's the exact drop reason?**
   - `invalid_url` → URL doesn't match http(s)://*.* or data:image/* pattern
   - `storeSafe_false` → Image marked as store-unsafe
   - `active_false` → Image marked inactive
   - `enabled_false` → Image marked disabled
   - `null_image` → Malformed image object

3. **Is the backend returning batch or legacy?**
   - `usedLegacyFallback: false` → Batch images are being served ✅
   - `usedLegacyFallback: true` → Falling back to legacy (find why above)

---

## Disabling Diagnostics
Simply unset the flag:
```bash
unset DEBUG_HERO_POOL
# Or in PowerShell:
Remove-Item env:DEBUG_HERO_POOL
```

Production builds will only log if NODE_ENV is 'development' or DEBUG_HERO_POOL is explicitly set.

---

## Next Steps
Once diagnostics are run and root cause identified:
1. Share the diagnostic output (sanitized for URLs)
2. Recommend smallest fix based on drop reason
3. Implement fix only after approval
