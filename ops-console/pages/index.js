import { useEffect, useState, useCallback } from 'react';
import {
  backend, worker,
  loadCreds, saveCreds, clearCreds,
  DEFAULT_BACKEND_URL, DEFAULT_WORKER_URL,
} from '../lib/api.js';

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
  const [hero, setHero] = useState(null);
  const [heroDraft, setHeroDraft] = useState({ url: '', alt: '' });
  const [push, setPush] = useState(null);
  const [pushDraft, setPushDraft] = useState({ hour: 8, minute: 0, enabled: true, title: '', body: '' });
  const [pushTestDraft, setPushTestDraft] = useState({ title: '', body: '' });

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshBackend = useCallback(async () => {
    try {
      const [s, t, r, rb, h, p] = await Promise.all([
        backend.status(),
        backend.getToday().catch(() => null),
        backend.getRuns(5).catch(() => null),
        backend.getRuleBucket().catch(() => null),
        backend.getHero().catch(() => null),
        backend.getPush().catch(() => null),
      ]);
      setBackendStatus({ ok: true, data: s });
      setToday(t);
      setRuns(r?.runs || []);
      setRuleBucket(rb?.ruleBucket || '0');
      setHero(h?.heroImage || null);
      if (h?.heroImage) setHeroDraft({ url: h.heroImage.url, alt: h.heroImage.alt || '' });
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
    setBusyAction('generate');
    try {
      await worker.generate({ ...creds, force, model: selectedModel || undefined });
      showToast('Generation started.');
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
      showToast(`Rule bucket bumped to ${r.ruleBucket}. All clients will repick.`);
    } catch (err) {
      showToast(`Bump failed: ${err.message}`, 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function saveHero() {
    if (!heroDraft.url) { showToast('URL required', 'error'); return; }
    setBusyAction('hero');
    try {
      const r = await backend.setHero({ url: heroDraft.url, alt: heroDraft.alt, enabled: true });
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
      setHeroDraft({ url: '', alt: '' });
      showToast('Hero image removed.');
    } catch (err) {
      showToast(`Hero remove failed: ${err.message}`, 'error');
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
        {!creds.workerKey && (
          <div style={{ color: '#888', fontSize: 12, marginTop: 10 }}>
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
            {Object.entries(today.predictions).map(([cat, p]) => (
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
                  }}>{cat}</div>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: '#1a3322', color: '#8aff9f', border: '1px solid #2a5535',
                  }}>LLM</span>
                </div>
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
        action={<span style={{ fontSize: 11, color: '#888' }}>bucket: <strong style={{ color: '#ccc' }}>{ruleBucket || '0'}</strong></span>}
      >
        <div style={{ fontSize: 13, color: '#ccc', marginBottom: 10 }}>
          Bumping the rule bucket forces every install to re-pick its rule-based
          prediction on next app open. Different users see different picks because
          each install has its own random salt.
        </div>
        <button
          className="primary"
          disabled={busyAction === 'bumpRule'}
          onClick={bumpRule}
        >
          {busyAction === 'bumpRule' ? 'Bumping…' : 'Bump rule bucket (refresh UI)'}
        </button>
      </Card>

      <Card title="Hero Image (top of UI)">
        <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
          Optional. If set, appears at the top of the daily reading. Leave empty
          to hide the section entirely.
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label>
            <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Image URL (https or data:image/...)</div>
            <input
              value={heroDraft.url}
              onChange={(e) => setHeroDraft((d) => ({ ...d, url: e.target.value }))}
              placeholder="https://your-cdn/tarot-girl.webp"
              style={{ width: '100%' }}
            />
          </label>
          <label>
            <div style={{ marginBottom: 4, color: '#aaa', fontSize: 12 }}>Alt text</div>
            <input
              value={heroDraft.alt}
              onChange={(e) => setHeroDraft((d) => ({ ...d, alt: e.target.value }))}
              placeholder="Tarot reader dealing cards"
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" disabled={busyAction === 'hero'} onClick={saveHero}>
              {hero ? 'Update' : 'Publish'}
            </button>
            {hero && (
              <button className="danger" disabled={busyAction === 'hero'} onClick={removeHero}>
                Remove
              </button>
            )}
          </div>
          {hero && (
            <div style={{
              marginTop: 8, padding: 10, background: '#0f0f17',
              border: '1px solid #1f1f2a', borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Live preview</div>
              <img
                src={hero.url}
                alt={hero.alt}
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
          <details style={{ marginTop: 6, fontSize: 12, color: '#aaa' }}>
            <summary style={{ cursor: 'pointer', color: '#ccc' }}>Image guidelines for the tarot-girl artwork</summary>
            <ul style={{ paddingLeft: 18, marginTop: 8, lineHeight: 1.6 }}>
              <li><strong>Aspect ratio:</strong> 4:5 portrait (e.g. 1024 x 1280 or 1200 x 1500).</li>
              <li><strong>Background:</strong> deep navy / near-black (#07080f) so it blends with the cosmic UI. Avoid bright whites.</li>
              <li><strong>Subject framing:</strong> waist-up of a young woman dealing tarot cards on a velvet table; cards visible in the lower third.</li>
              <li><strong>Palette:</strong> warm gold (#c9a96e), deep purples, candle warmth. Light source from the cards.</li>
              <li><strong>Mood:</strong> mystic, slightly cinematic, screenshot-worthy. Not cartoon, not stock.</li>
              <li><strong>Edges:</strong> soft vignette, no hard borders. The UI adds a top + bottom gradient mask automatically.</li>
              <li><strong>File format:</strong> WebP or JPG, under 200 KB. Compress aggressively, mobile bandwidth matters.</li>
              <li><strong>Hosting:</strong> upload to any image CDN (Vercel Blob, Cloudinary, Imgur direct link) and paste the URL.</li>
            </ul>
          </details>
        </div>
      </Card>

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
