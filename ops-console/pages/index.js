import { useEffect, useState, useCallback } from 'react';
import {
  backend, worker,
  loadCreds, saveCreds, clearCreds,
  DEFAULT_BACKEND_URL, DEFAULT_WORKER_URL,
} from '../lib/api.js';

/**
 * Resize a user-picked image File into a JPEG data URL.
 * Constrains the longest edge to maxEdge and uses the given quality.
 * Runs entirely in the browser, no upload yet.
 */
async function resizeImageToDataUrl(file, maxEdge = 1024, quality = 0.85) {
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('read_failed'));
    fr.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('image_decode_failed'));
    i.src = dataUrl;
  });
  const longest = Math.max(img.width, img.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#07080f';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('read_failed'));
    fr.readAsDataURL(file);
  });
}

function inferMediaTypeFromUrl(url) {
  return /\.(mp4|m4v|webm)(\?.*)?$/i.test(String(url || '')) ? 'video' : 'image';
}

function requirePositiveInteger(value, label) {
  const raw = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parseInt(raw, 10);
}

function getTodayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toDateInputValue(value) {
  const raw = String(value || '').trim();
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw || getTodayInputValue();
}

const EMPTY_POOL_IMAGE = {
  url: '',
  mediaType: 'image',
  posterUrl: '',
  title: '',
  active: true,
  storeSafe: true,
  tags: 'love, mood, mystical, Indian',
  readerMood: 'The Mirror',
  headline: '',
  cta: 'Let her draw your first signal',
  weight: 1,
  isDefault: false,
};

function Login({ onSubmit, bootstrapErr }) {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [opsKey, setOpsKey] = useState('');
  const [workerUrl, setWorkerUrl] = useState(DEFAULT_WORKER_URL);
  const [workerKey, setWorkerKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      // Verify via the server-side proxy (no CORS, no key in browser request)
      await backend.status();
      const creds = { backendUrl, opsKey, workerUrl, workerKey };
      saveCreds(creds);
      onSubmit(creds);
    } catch (err) {
      setError(`Backend auth failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: 24 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>WWHT Ops Console</h1>
      <p style={{ color: '#888', marginTop: 0, marginBottom: 24 }}>
        Connect to backend + local worker.
      </p>
      {bootstrapErr && (
        <div style={{ color: '#ffaa8a', fontSize: 12, marginBottom: 16 }}>
          Auto-bootstrap failed: {bootstrapErr}. Enter creds manually.
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <label>
          <div style={{ marginBottom: 6, color: '#aaa' }}>Backend URL</div>
          <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} required />
        </label>
        <label>
          <div style={{ marginBottom: 6, color: '#aaa' }}>OPS_KEY</div>
          <input type="password" value={opsKey} onChange={(e) => setOpsKey(e.target.value)} required />
        </label>
        <label>
          <div style={{ marginBottom: 6, color: '#aaa' }}>Worker URL (optional)</div>
          <input value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} />
        </label>
        <label>
          <div style={{ marginBottom: 6, color: '#aaa' }}>LOCAL_WORKER_KEY (optional)</div>
          <input type="password" value={workerKey} onChange={(e) => setWorkerKey(e.target.value)} />
        </label>
        {error && <div style={{ color: '#ff8aa0', fontSize: 13 }}>{error}</div>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  );
}

function StatusPill({ ok, label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 12, fontSize: 12,
      background: ok ? '#1a3322' : '#33221a',
      color: ok ? '#8aff9f' : '#ffaa8a',
      border: `1px solid ${ok ? '#2a5535' : '#553522'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: ok ? '#8aff9f' : '#ffaa8a',
      }} />
      {label}
    </span>
  );
}

function Card({ title, action, children }) {
  return (
    <div style={{
      background: '#13131c', border: '1px solid #1f1f2a',
      borderRadius: 10, padding: 18, marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 14,
      }}>
        <h2 style={{ margin: 0, fontSize: 14, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Dashboard({ creds, onLogout }) {
  const [backendStatus, setBackendStatus] = useState(null);
  const [workerStatus, setWorkerStatus] = useState(null);
  const [today, setToday] = useState(null);
  const [models, setModels] = useState(null);
  const [selectedModel, setSelectedModel] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [toast, setToast] = useState(null);
  const [runs, setRuns] = useState(null);
  const [ruleBucket, setRuleBucket] = useState(null);
  const [engineMode, setEngineMode] = useState(null);
  const [users, setUsers] = useState(null);
  const [pushDebug, setPushDebug] = useState(null);
  const [variantCount, setVariantCount] = useState(3);
  const [hero, setHero] = useState(null);
  const [heroDraft, setHeroDraft] = useState({ url: '' });
  const [heroUploading, setHeroUploading] = useState(false);
  const [heroPool, setHeroPool] = useState(null);
  const [heroPoolDraft, setHeroPoolDraft] = useState({
    dateKey: getTodayInputValue(),
    maxHeroShufflesPerDay: 4,
    maxHeroImagesPerDay: 5,
    images: [],
  });
  const [heroPoolImageDraft, setHeroPoolImageDraft] = useState(EMPTY_POOL_IMAGE);
  const [heroBatchUploading, setHeroBatchUploading] = useState(false);
  const [monetizationConfig, setMonetizationConfig] = useState(null);
  const [push, setPush] = useState(null);
  const [pushDraft, setPushDraft] = useState({ hour: 8, minute: 0, enabled: true, title: '', body: '' });
  const [pushTestDraft, setPushTestDraft] = useState({ title: '', body: '' });

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshBackend = useCallback(async () => {
    try {
      const [s, t, r, rb, h, hp, mc, p, em, u, pd] = await Promise.all([
        backend.status(),
        backend.getToday().catch(() => null),
        backend.getRuns(5).catch(() => null),
        backend.getRuleBucket().catch(() => null),
        backend.getHero().catch(() => null),
        backend.getHeroPool().catch(() => null),
        backend.getMonetizationConfig().catch(() => null),
        backend.getPush().catch(() => null),
        backend.getEngineMode().catch(() => null),
        backend.getUsers().catch(() => null),
        backend.getPushDebug().catch(() => null),
      ]);
      setBackendStatus({ ok: true, data: s });
      setToday(t);
      setRuns(r?.runs || []);
      setRuleBucket(rb?.ruleBucket || '0');
      setEngineMode(em?.engineMode || rb?.engineMode || 'llm');
      setUsers(u?.ok ? u : null);
      setPushDebug(pd?.ok ? pd.log : null);
      setHero(h?.heroImage || null);
      if (h?.heroImage) setHeroDraft({ url: h.heroImage.url });
      setHeroPool(hp?.heroPool || null);
      if (hp?.heroPool) {
        setHeroPoolDraft({
          dateKey: toDateInputValue(hp.heroPool.dateKey),
          maxHeroShufflesPerDay: String(hp.heroPool.config?.maxRewardedShufflesPerDay ?? hp.heroPool.config?.maxHeroShufflesPerDay ?? 4),
          maxHeroImagesPerDay: String(hp.heroPool.config?.maxImagesPerDay ?? hp.heroPool.config?.maxHeroImagesPerDay ?? 5),
          images: hp.heroPool.images || [],
        });
      }
      if (mc?.config) setMonetizationConfig(mc.config);
      if (p?.ok) {
        setPush(p);
        setPushDraft({
          hour: p.schedule?.hour ?? 8,
          minute: p.schedule?.minute ?? 0,
          enabled: p.schedule?.enabled !== false,
          title: p.schedule?.title || '',
          body: p.schedule?.body || '',
        });
      }
    } catch (err) {
      setBackendStatus({ ok: false, error: err.message });
    }
  }, []);

  const refreshWorker = useCallback(async () => {
    if (!creds.workerUrl) return;
    try {
      const h = await worker.health({ workerUrl: creds.workerUrl });
      setWorkerStatus({ ok: true, data: h });
      if (creds.workerKey) {
        worker.models(creds).then(setModels).catch(() => {});
      }
    } catch (err) {
      setWorkerStatus({ ok: false, error: err.message });
    }
  }, [creds]);

  useEffect(() => {
    refreshBackend();
    refreshWorker();
    const interval = setInterval(() => {
      refreshBackend();
      refreshWorker();
    }, 8000);
    return () => clearInterval(interval);
  }, [refreshBackend, refreshWorker]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(force) {
    if (!creds.workerKey) { showToast('Worker key required', 'error'); return; }
    const v = Math.max(1, Math.min(8, parseInt(variantCount, 10) || 1));
    setBusyAction('generate');
    try {
      await worker.generate({ ...creds, force, model: selectedModel || undefined, variantCount: v });
      showToast(`Generation started (${v} variant${v === 1 ? '' : 's'} per category).`);
      refreshWorker();
    } catch (err) {
      showToast(`Generate failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function clearCache() {
    if (!confirm("Clear today's cached predictions on backend?")) return;
    setBusyAction('clear');
    try {
      await backend.clearToday();
      showToast("Cleared today's cache.");
      refreshBackend();
    } catch (err) {
      showToast(`Clear failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function bumpRule() {
    setBusyAction('bumpRule');
    try {
      const r = await backend.bumpRuleBucket();
      setRuleBucket(r.ruleBucket);
      setEngineMode(r.engineMode || 'rule');
      showToast(`Rule bucket bumped to ${r.ruleBucket}. Engine mode → RULE. Clients will repick.`);
    } catch (err) {
      showToast(`Bump failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function setMode(mode) {
    setBusyAction(`mode-${mode}`);
    try {
      const r = await backend.setEngineMode(mode);
      setEngineMode(r.engineMode);
      showToast(`Engine mode set to ${r.engineMode.toUpperCase()}. Clients will switch on next refresh.`);
    } catch (err) {
      showToast(`Mode change failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function saveHero() {
    if (!heroDraft.url) { showToast('Pick an image first', 'error'); return; }
    setBusyAction('hero');
    try {
      const r = await backend.setHero({ url: heroDraft.url, enabled: true });
      setHero(r.heroImage);
      showToast('Hero image updated.');
    } catch (err) {
      showToast(`Hero save failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function removeHero() {
    if (!confirm('Remove hero image from the app?')) return;
    setBusyAction('hero');
    try {
      await backend.clearHero();
      setHero(null);
      setHeroDraft({ url: '' });
      showToast('Hero image removed.');
    } catch (err) {
      showToast(`Hero remove failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function onHeroFilePicked(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Pick an image file', 'error'); return; }
    setHeroUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 1024, 0.85);
      setHeroDraft({ url: dataUrl });
      const sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
      showToast(`Image ready (~${sizeKB} KB). Click Publish to push live.`);
    } catch (err) {
      showToast(`Image processing failed: ${err.message}`, 'error');
    } finally {
      setHeroUploading(false);
    }
  }

  async function fetchHeroPoolForDraftDate() {
    setBusyAction('heroPoolFetch');
    try {
      const r = await backend.getHeroPool(heroPoolDraft.dateKey);
      setHeroPool(r.heroPool || null);
      setHeroPoolDraft((d) => ({
        ...d,
        dateKey: toDateInputValue(r.heroPool?.dateKey || d.dateKey),
        maxHeroShufflesPerDay: String(r.heroPool?.config?.maxRewardedShufflesPerDay ?? r.heroPool?.config?.maxHeroShufflesPerDay ?? d.maxHeroShufflesPerDay),
        maxHeroImagesPerDay: String(r.heroPool?.config?.maxImagesPerDay ?? r.heroPool?.config?.maxHeroImagesPerDay ?? d.maxHeroImagesPerDay),
        images: r.heroPool?.images || [],
      }));
      showToast(r.heroPool ? 'Hero pool loaded.' : 'No hero pool stored for that date.');
    } catch (err) {
      showToast(`Hero pool fetch failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  function addHeroPoolImage() {
    const url = (heroPoolImageDraft.url || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      showToast('Use a public http(s) image or video URL for the daily pool.', 'error');
      return;
    }
    const mediaType = heroPoolImageDraft.mediaType || inferMediaTypeFromUrl(url);
    const title = heroPoolImageDraft.title || `Hero ${heroPoolDraft.images.length + 1}`;
    setHeroPoolDraft((d) => ({
      ...d,
      images: [
        ...(heroPoolImageDraft.isDefault ? d.images.map((img) => ({ ...img, isDefault: false })) : d.images),
        {
          ...heroPoolImageDraft,
          url,
          mediaUrl: url,
          mediaType,
          posterUrl: (heroPoolImageDraft.posterUrl || '').trim(),
          title,
          name: title,
          tags: heroPoolImageDraft.tags.split(',').map((t) => t.trim()).filter(Boolean),
          weight: parseInt(heroPoolImageDraft.weight, 10) || 1,
          isDefault: d.images.length === 0 || heroPoolImageDraft.isDefault,
        },
      ],
    }));
    setHeroPoolImageDraft(EMPTY_POOL_IMAGE);
  }

  async function uploadHeroBatchFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => (
      file.type?.startsWith('image/') || file.type === 'video/mp4' || /\.mp4$/i.test(file.name || '')
    ));
    if (!files.length) {
      showToast('Select image or MP4 files first.', 'error');
      return;
    }
    setHeroBatchUploading(true);
    try {
      const uploaded = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type === 'video/mp4' || /\.mp4$/i.test(file.name || '');
        const dataUrl = isVideo
          ? await fileToDataUrl(file)
          : await resizeImageToDataUrl(file, 900, 0.72);
        const r = await backend.uploadHeroBatchImage({
          dateKey: heroPoolDraft.dateKey,
          fileName: file.name,
          mediaType: isVideo ? 'video' : 'image',
          dataUrl,
        });
        const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        uploaded.push({
          url: r.url,
          mediaUrl: r.url,
          mediaType: r.mediaType || (isVideo ? 'video' : 'image'),
          posterUrl: '',
          title: baseName || `Batch hero ${heroPoolDraft.images.length + uploaded.length + 1}`,
          name: baseName || `Batch hero ${heroPoolDraft.images.length + uploaded.length + 1}`,
          active: true,
          storeSafe: true,
          tags: [],
          readerMood: 'The Mirror',
          headline: '',
          cta: 'Let her draw your first signal',
          weight: 1,
          isDefault: heroPoolDraft.images.length === 0 && uploaded.length === 0,
          uploadedAssetId: r.id,
          bytes: r.bytes,
        });
      }
      setHeroPoolDraft((d) => ({
        ...d,
        images: [
          ...d.images,
          ...uploaded,
        ].map((img, index, list) => ({
          ...img,
          isDefault: list.some((x) => x.isDefault) ? img.isDefault : index === 0,
        })),
      }));
      showToast(`Uploaded ${uploaded.length} batch media item${uploaded.length === 1 ? '' : 's'} into the draft. Click Publish daily pool to serve them.`);
    } catch (err) {
      showToast(`Batch upload failed: ${err.message}`, 'error');
    } finally {
      setHeroBatchUploading(false);
    }
  }

  function removeHeroPoolImage(index) {
    setHeroPoolDraft((d) => {
      const images = d.images.filter((_, i) => i !== index);
      if (images.length && !images.some((img) => img.isDefault)) images[0] = { ...images[0], isDefault: true };
      return { ...d, images };
    });
  }

  async function setDefaultHeroPoolImage(index) {
    let nextDraft;
    setHeroPoolDraft((d) => {
      nextDraft = {
        ...d,
        images: d.images.map((img, i) => ({ ...img, isDefault: i === index })),
      };
      return nextDraft;
    });
    if (!nextDraft?.images?.length) return;
    setBusyAction('heroPoolDefault');
    try {
      const r = await backend.setHeroPool(nextDraft);
      setHeroPool(r.heroPool);
      setHeroPoolDraft((d) => ({
        ...d,
        dateKey: toDateInputValue(r.heroPool.dateKey),
        images: r.heroPool.images || nextDraft.images,
        maxHeroShufflesPerDay: String(r.heroPool.config?.maxRewardedShufflesPerDay ?? r.heroPool.config?.maxHeroShufflesPerDay ?? d.maxHeroShufflesPerDay),
        maxHeroImagesPerDay: String(r.heroPool.config?.maxImagesPerDay ?? r.heroPool.config?.maxHeroImagesPerDay ?? d.maxHeroImagesPerDay),
      }));
      showToast('Default hero changed.');
    } catch (err) {
      showToast(`Default save failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function saveHeroPoolSettings() {
    let maxHeroShufflesPerDay;
    let maxHeroImagesPerDay;
    try {
      maxHeroShufflesPerDay = requirePositiveInteger(heroPoolDraft.maxHeroShufflesPerDay, 'Max rewarded shuffles/day');
      maxHeroImagesPerDay = requirePositiveInteger(heroPoolDraft.maxHeroImagesPerDay, 'Max images/day');
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    setBusyAction('heroPoolSettings');
    try {
      const r = await backend.saveHeroPoolSettings({
        dateKey: heroPoolDraft.dateKey,
        maxRewardedShufflesPerDay: maxHeroShufflesPerDay,
        maxHeroImagesPerDay,
      });
      setHeroPool(r.heroPool);
      setHeroPoolDraft((d) => ({
        ...d,
        dateKey: toDateInputValue(r.heroPool.dateKey),
        maxHeroShufflesPerDay: String(r.heroPool.config?.maxRewardedShufflesPerDay ?? r.heroPool.config?.maxHeroShufflesPerDay ?? maxHeroShufflesPerDay),
        maxHeroImagesPerDay: String(r.heroPool.config?.maxImagesPerDay ?? r.heroPool.config?.maxHeroImagesPerDay ?? maxHeroImagesPerDay),
        images: r.heroPool.images || d.images,
      }));
      showToast('Batch settings saved.');
    } catch (err) {
      showToast(`Batch settings save failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function resetHeroShuffleUsage() {
    if (!confirm(`Reset today's hero shuffle usage for ${heroPoolDraft.dateKey}?`)) return;
    setBusyAction('heroShuffleReset');
    try {
      const r = await backend.resetHeroShuffleUsage(heroPoolDraft.dateKey);
      setHeroPool(r.heroPool || heroPool);
      if (r.heroPool) {
        setHeroPoolDraft((d) => ({
          ...d,
          dateKey: toDateInputValue(r.heroPool.dateKey),
          images: r.heroPool.images || d.images,
          maxHeroShufflesPerDay: String(r.heroPool.config?.maxRewardedShufflesPerDay ?? r.heroPool.config?.maxHeroShufflesPerDay ?? d.maxHeroShufflesPerDay),
          maxHeroImagesPerDay: String(r.heroPool.config?.maxImagesPerDay ?? r.heroPool.config?.maxHeroImagesPerDay ?? d.maxHeroImagesPerDay),
        }));
      }
      showToast(`Hero shuffle usage reset nonce updated: ${r.heroShuffleResetNonce || 'saved'}.`);
    } catch (err) {
      showToast(`Hero shuffle reset failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function saveHeroPool() {
    if (!heroPoolDraft.images.length) {
      showToast('Add at least one public hero image or video URL.', 'error');
      return;
    }
    try {
      requirePositiveInteger(heroPoolDraft.maxHeroShufflesPerDay, 'Max rewarded shuffles/day');
      requirePositiveInteger(heroPoolDraft.maxHeroImagesPerDay, 'Max images/day');
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }
    setBusyAction('heroPool');
    try {
      const r = await backend.setHeroPool(heroPoolDraft);
      setHeroPool(r.heroPool);
      setHeroPoolDraft((d) => ({
        ...d,
        dateKey: toDateInputValue(r.heroPool.dateKey),
        images: r.heroPool.images || d.images,
        maxHeroShufflesPerDay: String(r.heroPool.config?.maxRewardedShufflesPerDay ?? r.heroPool.config?.maxHeroShufflesPerDay ?? d.maxHeroShufflesPerDay),
        maxHeroImagesPerDay: String(r.heroPool.config?.maxImagesPerDay ?? r.heroPool.config?.maxHeroImagesPerDay ?? d.maxHeroImagesPerDay),
      }));
      showToast(`Daily hero pool saved (${r.heroPool.images.length} media item${r.heroPool.images.length === 1 ? '' : 's'}).`);
    } catch (err) {
      showToast(`Hero pool save failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function clearHeroPool() {
    if (!confirm(`Clear hero pool for ${heroPoolDraft.dateKey}?`)) return;
    setBusyAction('heroPool');
    try {
      await backend.clearHeroPool(heroPoolDraft.dateKey);
      setHeroPool(null);
      setHeroPoolDraft((d) => ({ ...d, images: [] }));
      showToast('Hero pool cleared.');
    } catch (err) {
      showToast(`Hero pool clear failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function saveMonetizationConfig() {
    if (!monetizationConfig) return;
    setBusyAction('monetizationConfig');
    try {
      const r = await backend.setMonetizationConfig(monetizationConfig);
      setMonetizationConfig(r.config);
      showToast('Monetization config saved.');
    } catch (err) {
      showToast(`Config save failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function savePushSchedule() {
    setBusyAction('pushSched');
    try {
      const r = await backend.setPushSchedule(pushDraft);
      setPush((p) => ({ ...(p || {}), schedule: r.schedule }));
      showToast('Schedule saved.');
    } catch (err) {
      showToast(`Schedule failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function sendPushTest() {
    if (!confirm(`Send push to ALL ${push?.tokenCount || 0} registered devices now?`)) return;
    setBusyAction('pushSend');
    try {
      const r = await backend.sendPushNow({
        title: pushTestDraft.title || pushDraft.title || "Today's reading is ready",
        body: pushTestDraft.body || pushDraft.body || 'Open the app to see your four signals.',
      });
      showToast(`Sent. ok=${r.ok} failed=${r.failed}`);
      refreshBackend();
    } catch (err) {
      showToast(`Send failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function runPushTestRegistration() {
    setBusyAction('pushTestReg');
    try {
      await backend.requestPushTest({ note: 'ops console' });
      showToast('Requested. Devices that are open (or opened within 10 min) will retry registration; watch the trace below.');
      setTimeout(refreshBackend, 3000);
    } catch (err) {
      showToast(`Request failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  const todayReady = backendStatus?.data?.today?.ready;
  const activeJob = workerStatus?.data?.activeJob;
  const isJobRunning = activeJob?.status === 'running';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 24,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>WWHT Ops Console</h1>
          <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{creds.backendUrl}</div>
        </div>
        <button onClick={() => { clearCreds(); onLogout(); }}>Sign out</button>
      </header>

      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 100,
          padding: '10px 16px', borderRadius: 8,
          background: toast.kind === 'error' ? '#3a1a22' : '#1a2a3a',
          border: `1px solid ${toast.kind === 'error' ? '#5a2a35' : '#2a4a5a'}`,
          color: toast.kind === 'error' ? '#ff8aa0' : '#8ab4ff',
        }}>{toast.msg}</div>
      )}

      <Card
        title="Users"
        action={
          users && (
            <span style={{ fontSize: 11, color: '#888' }}>
              push tokens: <strong style={{ color: '#ccc' }}>{users.pushTokens}</strong>
            </span>
          )
        }
      >
        {!users && <div style={{ color: '#666', fontSize: 13 }}>Loading…</div>}
        {users && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total installs</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: '#fff' }}>{users.total.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active today</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: '#7be07b' }}>{users.dau.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Push opt-in</div>
                <div style={{ fontSize: 28, fontWeight: 600, color: '#7bb6ff' }}>{users.pushTokens.toLocaleString()}</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Last 7 days (DAU)</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 60 }}>
                {[...users.last7].reverse().map((d) => {
                  const max = Math.max(1, ...users.last7.map((x) => x.count));
                  const h = Math.round((d.count / max) * 56) + 4;
                  return (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ height: h, width: '100%', background: '#3b6cd6', borderRadius: 3 }} title={`${d.date}: ${d.count}`} />
                      <div style={{ fontSize: 9, color: '#666' }}>{d.date.slice(6)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#666' }}>
              Counts use HyperLogLog (≈1% error). Each install pings the daily endpoint with an anonymous hash on app open.
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card
          title="Backend"
          action={<button onClick={refreshBackend}>Refresh</button>}
        >
          {!backendStatus && <div style={{ color: '#666' }}>Loading…</div>}
          {backendStatus?.ok && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatusPill ok={backendStatus.data.ok} label="Service OK" />
                <StatusPill ok={backendStatus.data.redis?.ok} label="Redis" />
                <StatusPill ok={backendStatus.data.env?.opsKeyConfigured} label="OPS_KEY" />
                <StatusPill ok={backendStatus.data.env?.cronSecretConfigured} label="CRON" />
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Date: <strong style={{ color: '#ccc' }}>{backendStatus.data.today?.dateKey}</strong>
                {' · '}
                <StatusPill ok={todayReady} label={todayReady ? 'Today ready' : 'Today empty'} />
              </div>
              {backendStatus.data.today?.generatedAt && (
                <div style={{ fontSize: 12, color: '#666' }}>
                  Generated: {new Date(backendStatus.data.today.generatedAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
          {backendStatus?.ok === false && (
            <div style={{ color: '#ff8aa0', fontSize: 13 }}>{backendStatus.error}</div>
          )}
        </Card>

        <Card
          title="Local Worker"
          action={<button onClick={refreshWorker}>Refresh</button>}
        >
          {!workerStatus && !creds.workerUrl && (
            <div style={{ color: '#666', fontSize: 13 }}>No worker URL configured.</div>
          )}
          {workerStatus?.ok && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatusPill ok={workerStatus.data.ok} label="Worker online" />
                <StatusPill ok={isJobRunning} label={isJobRunning ? 'Job running' : 'Idle'} />
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>
                Uptime: {Math.round(workerStatus.data.uptime)}s
              </div>
              {activeJob && (
                <pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(activeJob, null, 2)}</pre>
              )}
            </div>
          )}
          {workerStatus?.ok === false && (
            <div style={{ color: '#ff8aa0', fontSize: 13 }}>{workerStatus.error}</div>
          )}
        </Card>
      </div>

      <Card title="Generate Today's Predictions">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {models?.ok && models.models?.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: '#0f0f17', color: '#e8e8f0',
                border: '1px solid #2a2a35', borderRadius: 6, padding: '8px 12px',
              }}
            >
              <option value="">(default model)</option>
              {models.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#aaa' }}>
            Variants per category
            <input
              type="number" min={1} max={8} step={1}
              value={variantCount}
              onChange={(e) => setVariantCount(e.target.value)}
              style={{ width: 56, background: '#0f0f17', color: '#e8e8f0', border: '1px solid #2a2a35', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}
            />
          </label>
          <button
            className="primary"
            disabled={busyAction === 'generate' || isJobRunning || !creds.workerKey}
            onClick={() => generate(false)}
          >
            {isJobRunning ? 'Job in progress…' : 'Generate (skip if cached)'}
          </button>
          <button
            disabled={busyAction === 'generate' || isJobRunning || !creds.workerKey}
            onClick={() => generate(true)}
          >
            Force regenerate
          </button>
          <button
            className="danger"
            disabled={busyAction === 'clear'}
            onClick={clearCache}
          >
            Clear backend cache
          </button>
        </div>
        <div style={{ color: '#888', fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
          With variants &gt; 1, the worker generates that many distinct LLM predictions per category and stores them as an array.
          Each install is deterministically assigned one variant by hashing (installSalt | ruleBucket | date | category),
          so different users see different versions on the same day. Bumping the rule bucket rotates everyone to a new variant instantly.
        </div>
        {!creds.workerKey && (
          <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
            Generate buttons disabled — no LOCAL_WORKER_KEY in this session.
          </div>
        )}
      </Card>

      <Card title="Today's Predictions" action={<button onClick={refreshBackend}>Reload</button>}>
        {!today && <div style={{ color: '#666' }}>None loaded.</div>}
        {today?.empty && (
          <div style={{ color: '#888', fontSize: 13 }}>
            No predictions cached for {today.dateKey}. Run "Generate" to create them.
          </div>
        )}
        {today && today.predictions && (
          <div style={{ display: 'grid', gap: 12 }}>
            {Object.entries(today.predictions).map(([cat, raw]) => {
              const list = Array.isArray(raw) ? raw : [raw];
              return (
                <div key={cat} style={{
                  background: '#0f0f17', border: '1px solid #1f1f2a',
                  borderRadius: 8, padding: 14,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 6,
                  }}>
                    <div style={{
                      fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1,
                    }}>{cat}{list.length > 1 ? ` · ${list.length} variants` : ''}</div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: '#1a3322', color: '#8aff9f', border: '1px solid #2a5535',
                    }}>LLM</span>
                  </div>
                  {list.map((p, vi) => (
                    <div key={vi} style={{
                      borderTop: vi === 0 ? 'none' : '1px dashed #1f1f2a',
                      paddingTop: vi === 0 ? 0 : 10, marginTop: vi === 0 ? 0 : 10,
                    }}>
                      {list.length > 1 && (
                        <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>variant {vi + 1}</div>
                      )}
                      <div style={{ fontSize: 15, marginBottom: 8 }}>{p.teaser}</div>
                      <div style={{ fontSize: 13, color: '#ccc', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{p.full}</div>
                      {p.punch && (
                        <div style={{ fontSize: 13, color: '#ffaa8a', fontStyle: 'italic', marginBottom: 8 }}>
                          "{p.punch}"
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#888' }}>{p.action}</div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{p.timing}</div>
                    </div>
                  ))}
                </div>
              );
            })}
            {today.errors && (
              <div style={{
                background: '#3a1a22', border: '1px solid #5a2a35', borderRadius: 8,
                padding: 12, fontSize: 12, color: '#ffaaaa',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Per-category LLM errors</div>
                {Object.entries(today.errors).map(([cat, msg]) => (
                  <div key={cat} style={{ marginBottom: 4 }}>
                    <strong style={{ color: '#ff8aa0' }}>{cat}:</strong> {msg}
                  </div>
                ))}
                <div style={{ marginTop: 6, color: '#ccc' }}>
                  Rule-based engine fills these gaps automatically on the device.
                </div>
              </div>
            )}
          </div>
        )}

      </Card>

      <Card title="LLM Run History" action={<button onClick={refreshBackend}>Reload</button>}>
        {!runs && <div style={{ color: '#666' }}>Loading…</div>}
        {runs && runs.length === 0 && <div style={{ color: '#666', fontSize: 13 }}>No runs yet.</div>}
        {runs && runs.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {runs.map((run, i) => (
              <div key={i} style={{
                background: '#0f0f17', border: '1px solid #1f1f2a',
                borderRadius: 8, padding: 12, fontSize: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#ccc' }}>
                    {run.dateKey} · {run.model} · {run.successCount}/4 ok
                  </span>
                  <span style={{ color: '#666' }}>
                    {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : ''}
                  </span>
                </div>
                {run.attempts && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {Object.entries(run.attempts).map(([cat, a]) => (
                      <div key={cat} style={{
                        padding: '4px 8px', borderRadius: 6,
                        background: a.ok ? '#1a3322' : '#3a1a22',
                        color: a.ok ? '#8aff9f' : '#ff8aa0',
                      }}>
                        <strong>{cat}</strong>: {a.ok ? `ok (${a.ms}ms)` : a.error?.slice(0, 80)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Rule-Based Engine"
        action={
          <span style={{ fontSize: 11, color: '#888' }}>
            mode: <strong style={{ color: engineMode === 'rule' ? '#7be07b' : '#7bb6ff' }}>{(engineMode || 'llm').toUpperCase()}</strong>
            {' · '}bucket: <strong style={{ color: '#ccc' }}>{ruleBucket || '0'}</strong>
          </span>
        }
      >
        <div style={{ fontSize: 13, color: '#ccc', marginBottom: 10, lineHeight: 1.5 }}>
          The app renders <strong>one</strong> source at a time, controlled by the engine mode flag.
          <br />• <strong>LLM mode:</strong> generated variants are shown (set automatically on successful generation).
          <br />• <strong>RULE mode:</strong> rule-based picks are shown, varied per install via salt + bucket (set automatically when you bump the bucket).
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Rule pool: <strong style={{ color: '#ccc' }}>68</strong> entries per category.
          Bumping the bucket rotates every install to its next deterministic pick AND switches mode → RULE.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="primary"
            disabled={busyAction === 'bumpRule'}
            onClick={bumpRule}
          >
            {busyAction === 'bumpRule' ? 'Bumping…' : 'Bump rule bucket (→ RULE mode)'}
          </button>
          <button
            disabled={busyAction === 'mode-llm' || engineMode === 'llm'}
            onClick={() => setMode('llm')}
          >
            {busyAction === 'mode-llm' ? '…' : 'Force LLM mode'}
          </button>
          <button
            disabled={busyAction === 'mode-rule' || engineMode === 'rule'}
            onClick={() => setMode('rule')}
          >
            {busyAction === 'mode-rule' ? '…' : 'Force RULE mode'}
          </button>
        </div>
      </Card>

      <Card title="Hero Image (top of UI)">
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Optional. Pick an image from your device. It will be resized to a 4:5 portrait
          (max 1024px wide, JPEG ~85% quality) and pushed live. Leave empty to hide the section.
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label
            style={{
              display: 'inline-block', padding: '10px 14px', cursor: 'pointer',
              border: '1px dashed #2a2a35', borderRadius: 8, color: '#ccc',
              background: '#0f0f17', textAlign: 'center',
            }}
          >
            {heroUploading ? 'Processing image…' : (heroDraft.url ? 'Pick a different image' : 'Choose image from device')}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => onHeroFilePicked(e.target.files?.[0])}
            />
          </label>
          {heroDraft.url && (
            <div style={{
              padding: 10, background: '#0f0f17',
              border: '1px solid #1f1f2a', borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Preview</div>
              <img
                src={heroDraft.url}
                alt=""
                style={{
                  width: '100%', maxHeight: 400, objectFit: 'cover',
                  borderRadius: 6, border: '1px solid #2a2a35',
                }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={busyAction === 'hero' || heroUploading || !heroDraft.url} onClick={saveHero}>
              {hero ? 'Update' : 'Publish'}
            </button>
            {hero && (
              <button className="danger" disabled={busyAction === 'hero'} onClick={removeHero}>
                Remove
              </button>
            )}
          </div>
          {hero && hero.url !== heroDraft.url && (
            <div style={{
              marginTop: 8, padding: 10, background: '#0f0f17',
              border: '1px solid #1f1f2a', borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Currently live</div>
              <img
                src={hero.url}
                alt=""
                style={{
                  width: '100%', maxHeight: 400, objectFit: 'cover',
                  borderRadius: 6, border: '1px solid #2a2a35',
                }}
              />
              <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>
                Updated: {hero.updatedAt ? new Date(hero.updatedAt).toLocaleString() : 'unknown'}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Daily Hero Batch">
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Additive batch layer. The old one-hero controls above still write only <code>wwht:heroImage</code>.
          This section stores batch metadata under new daily keys and falls back to the one-hero image when no valid batch is available.
        </div>
        <div style={{ fontSize: 12, color: '#ffaa8a', marginBottom: 10 }}>
          Local upload mode stores resized images in namespaced Redis asset keys and serves them through the backend. This is useful for small daily batches. For production scale, prefer public CDN/R2/S3 URLs.
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label>
              <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Date</div>
              <input
                type="date"
                value={heroPoolDraft.dateKey}
                onChange={(e) => setHeroPoolDraft((d) => ({ ...d, dateKey: e.target.value }))}
              />
            </label>
            <label>
              <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Max rewarded shuffles/day</div>
              <input
                type="number"
                min={1}
                value={heroPoolDraft.maxHeroShufflesPerDay}
                onChange={(e) => setHeroPoolDraft((d) => ({ ...d, maxHeroShufflesPerDay: e.target.value }))}
                style={{ width: 120 }}
              />
            </label>
            <label>
              <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Max images/day</div>
              <input
                type="number"
                min={1}
                value={heroPoolDraft.maxHeroImagesPerDay}
                onChange={(e) => setHeroPoolDraft((d) => ({ ...d, maxHeroImagesPerDay: e.target.value }))}
                style={{ width: 120 }}
              />
            </label>
            <button className="primary" disabled={busyAction === 'heroPoolSettings'} onClick={saveHeroPoolSettings}>
              Save batch settings
            </button>
            <button disabled={busyAction === 'heroPoolFetch'} onClick={fetchHeroPoolForDraftDate}>
              Fetch date
            </button>
            <button disabled={busyAction === 'heroShuffleReset'} onClick={resetHeroShuffleUsage}>
              Reset today's hero shuffle usage
            </button>
          </div>

          <div style={{ padding: 12, background: '#0f0f17', border: '1px solid #1f1f2a', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Upload/select local images or MP4 videos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <label
                style={{
                  display: 'inline-block', padding: '10px 14px', cursor: heroBatchUploading ? 'default' : 'pointer',
                  border: '1px dashed #2a2a35', borderRadius: 8, color: '#ccc',
                  background: '#10101a',
                }}
              >
                {heroBatchUploading ? 'Uploading...' : 'Select media files'}
                <input
                  type="file"
                  accept="image/*,video/mp4"
                  multiple
                  disabled={heroBatchUploading}
                  style={{ display: 'none' }}
                  onChange={(e) => uploadHeroBatchFiles(e.target.files)}
                />
              </label>
              <label
                style={{
                  display: 'inline-block', padding: '10px 14px', cursor: heroBatchUploading ? 'default' : 'pointer',
                  border: '1px dashed #2a2a35', borderRadius: 8, color: '#ccc',
                  background: '#10101a',
                }}
              >
                {heroBatchUploading ? 'Uploading...' : 'Select folder'}
                <input
                  type="file"
                  accept="image/*,video/mp4"
                  multiple
                  webkitdirectory=""
                  directory=""
                  disabled={heroBatchUploading}
                  style={{ display: 'none' }}
                  onChange={(e) => uploadHeroBatchFiles(e.target.files)}
                />
              </label>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #1f1f2a', margin: '10px 0 12px' }} />

            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8 }}>Or register public image/video URL</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <input
                value={heroPoolImageDraft.url}
                onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, url: e.target.value }))}
                placeholder="https://cdn.example.com/wwht/reader-01.jpg or .mp4"
                style={{ width: '100%' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
                <select
                  value={heroPoolImageDraft.mediaType}
                  onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, mediaType: e.target.value }))}
                >
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                </select>
                <input
                  value={heroPoolImageDraft.posterUrl}
                  onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, posterUrl: e.target.value }))}
                  placeholder="Optional poster URL for video"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  value={heroPoolImageDraft.title}
                  onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Internal title (ops only)"
                />
                <input
                  value={heroPoolImageDraft.readerMood}
                  onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, readerMood: e.target.value }))}
                  placeholder="Reader label / mood"
                />
              </div>
              <div style={{ color: '#777', fontSize: 11 }}>
                Internal title is for ops/admin identification. Reader label, headline, and CTA are visible in the app.
              </div>
              <input
                value={heroPoolImageDraft.headline}
                onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, headline: e.target.value }))}
                placeholder="Headline shown under hero"
                style={{ width: '100%' }}
              />
              <input
                value={heroPoolImageDraft.cta}
                onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, cta: e.target.value }))}
                placeholder="CTA button text"
                style={{ width: '100%' }}
              />
              <input
                value={heroPoolImageDraft.tags}
                onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, tags: e.target.value }))}
                placeholder="love, career, money, mood, intimate, mystical, Indian, dark, gold, mirror"
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={heroPoolImageDraft.active}
                    onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, active: e.target.checked }))}
                  />
                  <span style={{ fontSize: 12, color: '#ccc' }}>Active</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={heroPoolImageDraft.storeSafe}
                    onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, storeSafe: e.target.checked }))}
                  />
                  <span style={{ fontSize: 12, color: '#ccc' }}>Store safe</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={heroPoolImageDraft.isDefault}
                    onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, isDefault: e.target.checked }))}
                  />
                  <span style={{ fontSize: 12, color: '#ccc' }}>Default</span>
                </label>
                <label>
                  <span style={{ fontSize: 12, color: '#aaa', marginRight: 6 }}>Weight</span>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={heroPoolImageDraft.weight}
                    onChange={(e) => setHeroPoolImageDraft((d) => ({ ...d, weight: e.target.value }))}
                    style={{ width: 70 }}
                  />
                </label>
                <button className="primary" onClick={addHeroPoolImage}>Add to pool</button>
              </div>
            </div>
          </div>

          {heroPoolDraft.images.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {heroPoolDraft.images.map((img, index) => (
                <div key={`${img.url || img.mediaUrl}-${index}`} style={{ display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 10, alignItems: 'center', padding: 8, background: '#0f0f17', border: '1px solid #1f1f2a', borderRadius: 8 }}>
                  {img.mediaType === 'video' ? (
                    <video src={img.url || img.mediaUrl} poster={img.posterUrl || undefined} muted playsInline style={{ width: 90, height: 112, objectFit: 'cover', borderRadius: 6, border: '1px solid #2a2a35', background: '#06060c' }} />
                  ) : (
                    <img src={img.url || img.mediaUrl} alt="" style={{ width: 90, height: 112, objectFit: 'cover', borderRadius: 6, border: '1px solid #2a2a35' }} />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#ddd', fontSize: 13 }}>{img.title || img.name || `Hero ${index + 1}`} {img.isDefault ? <span style={{ color: '#c9a96e' }}>· default</span> : null}</div>
                    <div style={{ color: '#aaa', fontSize: 12 }}>{img.readerMood} · weight {img.weight || 1}</div>
                    <div style={{ color: '#777', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.url || img.mediaUrl}</div>
                    {img.posterUrl ? <div style={{ color: '#777', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>poster: {img.posterUrl}</div> : null}
                    <div style={{ color: '#777', fontSize: 11 }}>{Array.isArray(img.tags) ? img.tags.join(', ') : img.tags}</div>
                    {img.active === false || img.storeSafe === false ? (
                      <div style={{ color: '#ffaa8a', fontSize: 11 }}>Not servable: {img.active === false ? 'inactive ' : ''}{img.storeSafe === false ? 'storeUnsafe' : ''}</div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button disabled={img.isDefault || busyAction === 'heroPoolDefault'} onClick={() => setDefaultHeroPoolImage(index)}>Default</button>
                    <button className="danger" onClick={() => removeHeroPoolImage(index)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#777', fontSize: 12 }}>No media in this daily pool yet. Add public image or MP4 URLs, then publish.</div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" disabled={busyAction === 'heroPool' || heroPoolDraft.images.length === 0} onClick={saveHeroPool}>
              Publish daily pool
            </button>
            {heroPool && (
              <button className="danger" disabled={busyAction === 'heroPool'} onClick={clearHeroPool}>
                Clear pool
              </button>
            )}
          </div>

          {heroPool && (
            <div style={{ color: '#666', fontSize: 11 }}>
              Live pool: {heroPool.dateKey} · revision {heroPool.revision || 0} · updated {heroPool.updatedAt ? new Date(heroPool.updatedAt).toLocaleString() : 'unknown'}
            </div>
          )}
        </div>
      </Card>

      {monetizationConfig && (
        <Card title="Monetization Config">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['freeSignalsPerDay', 'lockedSignalsPerDay', 'maxHeroShufflesPerDay', 'maxHeroImagesPerDay'].map((key) => (
                <label key={key}>
                  <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>{key}</div>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={monetizationConfig[key]}
                    onChange={(e) => setMonetizationConfig((d) => ({ ...d, [key]: parseInt(e.target.value, 10) || 0 }))}
                    style={{ width: 120 }}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {['deeperMeaningEnabled', 'rewardedAdsEnabled', 'todayUnlockEnabled', 'thirtyDayUnlockEnabled', 'fallbackHeroEnabled'].map((key) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={monetizationConfig[key] !== false}
                    onChange={(e) => setMonetizationConfig((d) => ({ ...d, [key]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 12, color: '#ccc' }}>{key}</span>
                </label>
              ))}
            </div>
            <button className="primary" disabled={busyAction === 'monetizationConfig'} onClick={saveMonetizationConfig}>
              Save monetization config
            </button>
          </div>
        </Card>
      )}

      <Card
        title="Daily Push Notifications"
        action={
          <span style={{ fontSize: 11, color: '#888' }}>
            registered: <strong style={{ color: '#ccc' }}>{push?.tokenCount ?? '—'}</strong>
          </span>
        }
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label>
              <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Hour (IST, 0-23)</div>
              <input
                type="number" min={0} max={23}
                value={pushDraft.hour}
                onChange={(e) => setPushDraft((d) => ({ ...d, hour: parseInt(e.target.value, 10) || 0 }))}
                style={{ width: 80 }}
              />
            </label>
            <label>
              <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Minute (0-59)</div>
              <input
                type="number" min={0} max={59}
                value={pushDraft.minute}
                onChange={(e) => setPushDraft((d) => ({ ...d, minute: parseInt(e.target.value, 10) || 0 }))}
                style={{ width: 80 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={pushDraft.enabled}
                onChange={(e) => setPushDraft((d) => ({ ...d, enabled: e.target.checked }))}
              />
              <span style={{ fontSize: 12, color: '#ccc' }}>Enabled</span>
            </label>
          </div>
          <label>
            <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Title</div>
            <input
              value={pushDraft.title}
              onChange={(e) => setPushDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Today's reading is ready"
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Body</div>
            <input
              value={pushDraft.body}
              onChange={(e) => setPushDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder="Your four signals for today are waiting."
              style={{ width: '100%' }}
            />
          </label>
          <button className="primary" disabled={busyAction === 'pushSched'} onClick={savePushSchedule}>
            Save schedule
          </button>

          <hr style={{ border: 'none', borderTop: '1px solid #1f1f2a', margin: '12px 0' }} />

          <div style={{ fontSize: 12, color: '#aaa' }}>Send a one-off push now</div>
          <input
            value={pushTestDraft.title}
            onChange={(e) => setPushTestDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="Title (defaults to scheduled title)"
            style={{ width: '100%' }}
          />
          <input
            value={pushTestDraft.body}
            onChange={(e) => setPushTestDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="Body (defaults to scheduled body)"
            style={{ width: '100%' }}
          />
          <button className="danger" disabled={busyAction === 'pushSend' || !push?.tokenCount} onClick={sendPushTest}>
            Send to all {push?.tokenCount || 0} devices now
          </button>

          {push?.recentSends?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Recent sends</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {push.recentSends.map((s, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#aaa' }}>
                    {new Date(s.at).toLocaleString()} · {s.trigger} · ok={s.ok} failed={s.failed} pruned={s.prunedInvalid}
                  </div>
                ))}
              </div>
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid #1f1f2a', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              Registration trace from devices (last 30 steps)
              {(!pushDebug || pushDebug.length === 0) && <span style={{ color: '#666' }}> — nothing yet. Click the button to trigger a test on any open app.</span>}
            </div>
            <button
              disabled={busyAction === 'pushTestReg'}
              onClick={runPushTestRegistration}
              title="Ask every open app to re-run its FCM registration. Watch the trace populate below within ~45s."
            >
              {busyAction === 'pushTestReg' ? 'Requesting…' : 'Run test registration'}
            </button>
          </div>
          {pushDebug && pushDebug.length > 0 && (
            <div style={{ display: 'grid', gap: 2, maxHeight: 280, overflowY: 'auto', background: '#0a0a12', padding: 8, borderRadius: 6, fontFamily: 'monospace', fontSize: 11 }}>
              {pushDebug.map((d, i) => (
                <div key={i} style={{ color: d.ok ? '#7be07b' : '#ff8aa0', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#666', flexShrink: 0 }}>{d.at?.slice(11, 19)}</span>
                  <span style={{ width: 110, flexShrink: 0 }}>{d.step}</span>
                  <span style={{ color: '#888', width: 60, flexShrink: 0 }}>{d.platform} v{d.appVersion}</span>
                  <span style={{ color: '#888', width: 80, flexShrink: 0 }} title={d.installId}>{(d.installId || '').slice(0, 8)}</span>
                  <span style={{ flex: 1, wordBreak: 'break-all' }}>{d.info}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function HomePage() {
  const [creds, setCreds] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [bootstrapErr, setBootstrapErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Try in-browser saved creds first
      const saved = loadCreds();
      if (saved && saved.opsKey) {
        if (!cancelled) { setCreds(saved); setHydrated(true); }
        return;
      }
      // 2. Auto-bootstrap from disk via API route
      try {
        const r = await fetch('/api/bootstrap');
        const data = await r.json();
        if (data.autoLogin && data.opsKey) {
          const auto = {
            backendUrl: data.backendUrl,
            opsKey: data.opsKey,
            workerUrl: data.workerUrl,
            workerKey: data.workerKey || '',
          };
          saveCreds(auto);
          if (!cancelled) { setCreds(auto); setHydrated(true); }
          return;
        }
      } catch (err) {
        if (!cancelled) setBootstrapErr(err.message);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!hydrated) {
    return (
      <div style={{ padding: 80, textAlign: 'center', color: '#888' }}>
        Loading creds…
      </div>
    );
  }
  if (!creds) return <Login onSubmit={setCreds} bootstrapErr={bootstrapErr} />;
  return <Dashboard creds={creds} onLogout={() => setCreds(null)} />;
}
