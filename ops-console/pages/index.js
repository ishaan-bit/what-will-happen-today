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
      // Verify backend creds — worker is optional (might not be running)
      await backend.status({ backendUrl, opsKey });
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

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshBackend = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        backend.status(creds),
        backend.getToday(creds).catch(() => null),
      ]);
      setBackendStatus({ ok: true, data: s });
      setToday(t);
    } catch (err) {
      setBackendStatus({ ok: false, error: err.message });
    }
  }, [creds]);

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
  }, [refreshBackend, refreshWorker]);

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
      await backend.clearToday(creds);
      showToast("Cleared today's cache.");
      refreshBackend();
    } catch (err) {
      showToast(`Clear failed: ${err.message}`, 'error');
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
                  fontSize: 11, color: '#888', textTransform: 'uppercase',
                  letterSpacing: 1, marginBottom: 6,
                }}>{cat}</div>
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
              <div style={{ fontSize: 12, color: '#ffaa8a' }}>
                Some categories failed: {JSON.stringify(today.errors)}
              </div>
            )}
          </div>
        )}

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
