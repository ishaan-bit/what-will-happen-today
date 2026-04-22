import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';

const shell = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #0b111a 0%, #07080f 100%)',
  color: '#eef0f5',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  padding: '32px 20px',
};
const card = {
  maxWidth: 900,
  margin: '0 auto',
  background: 'rgba(13,17,32,0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
  padding: 28,
  marginBottom: 18,
};
const button = {
  background: 'rgba(201,169,110,0.14)',
  border: '1px solid rgba(201,169,110,0.5)',
  color: '#c9a96e',
  padding: '8px 14px',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.5,
};
const input = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#eef0f5',
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: 14,
  width: '100%',
  fontFamily: 'ui-monospace, monospace',
};
const kicker = { color: '#c9a96e', textTransform: 'uppercase', letterSpacing: 2, fontSize: 11, fontWeight: 700 };
const dim = { color: '#9baabf', fontSize: 13 };
const muted = { color: '#5a6880', fontSize: 12 };

function Pill({ children, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '4px 10px', borderRadius: 999,
      background: `${color}1f`, color, fontSize: 11, fontWeight: 700, letterSpacing: 1,
    }}>{children}</span>
  );
}

export default function OpsConsole() {
  const [opsKey, setOpsKey] = useState('');
  const [status, setStatus] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [authed, setAuthed] = useState(false);

  // Restore key from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('wwht-ops-key');
    if (saved) setOpsKey(saved);
  }, []);

  const call = useCallback(async (path, opts = {}) => {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'X-Ops-Key': opsKey,
        ...(opts.headers || {}),
      },
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, body };
  }, [opsKey]);

  const refresh = useCallback(async () => {
    if (!opsKey) return;
    setLoading(true);
    setMsg(null);
    const [statusRes, predRes] = await Promise.all([
      call('/api/ops/status'),
      call('/api/ops/predictions/today'),
    ]);
    if (statusRes.status === 401) {
      setMsg({ type: 'error', text: 'Wrong ops key.' });
      setAuthed(false);
    } else {
      setAuthed(true);
      setStatus(statusRes.body);
      window.localStorage.setItem('wwht-ops-key', opsKey);
    }
    if (predRes.status === 200) setPredictions(predRes.body);
    else setPredictions(null);
    setLoading(false);
  }, [opsKey, call]);

  const regenerate = useCallback(async () => {
    if (!confirm('Clear today\'s prediction cache? The next worker run will regenerate.')) return;
    setLoading(true);
    const res = await call('/api/ops/predictions/regenerate', { method: 'POST', body: '{}' });
    setMsg(res.ok
      ? { type: 'ok', text: `Cleared ${res.body?.dateKey}. Run the worker to regenerate.` }
      : { type: 'error', text: res.body?.message || 'Regenerate failed.' });
    setPredictions(null);
    setLoading(false);
  }, [call]);

  return (
    <>
      <Head><title>WWHT Ops</title></Head>
      <main style={shell}>
        <div style={card}>
          <p style={kicker}>WWHT Ops Console</p>
          <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>What Will Happen Today</h1>
          <p style={dim}>Lightweight operator view of the daily prediction cache.</p>
        </div>

        {/* Auth */}
        <div style={card}>
          <p style={kicker}>Ops key</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <input
              style={input}
              type="password"
              value={opsKey}
              placeholder="X-Ops-Key"
              onChange={(e) => setOpsKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') refresh(); }}
            />
            <button style={button} onClick={refresh} disabled={!opsKey || loading}>
              {loading ? '…' : 'Connect'}
            </button>
          </div>
          {msg ? (
            <p style={{ color: msg.type === 'ok' ? '#6ed4b0' : '#e8736a', fontSize: 13, marginTop: 12 }}>{msg.text}</p>
          ) : null}
        </div>

        {/* Status */}
        {authed && status ? (
          <div style={card}>
            <p style={kicker}>Status</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              <Pill color={status.redis?.ok ? '#6ed4b0' : '#e8736a'}>
                Redis {status.redis?.ok ? 'OK' : 'DOWN'}
              </Pill>
              <Pill color={status.today?.ready ? '#6ed4b0' : '#c9a96e'}>
                Today {status.today?.ready ? 'READY' : 'NOT READY'}
              </Pill>
              <Pill color="#7db8f7">Date {status.today?.dateKey}</Pill>
              {status.today?.generatedAt ? (
                <Pill color="#9baabf">Generated {new Date(status.today.generatedAt).toLocaleString()}</Pill>
              ) : null}
            </div>
            <p style={muted}>
              env: redis={String(status.env?.redisConfigured)} ·
              cron={String(status.env?.cronSecretConfigured)} ·
              ops={String(status.env?.opsKeyConfigured)}
            </p>
          </div>
        ) : null}

        {/* Today's predictions */}
        {authed && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={kicker}>Today\u2019s predictions</p>
              <button style={button} onClick={regenerate} disabled={loading}>Clear &amp; regenerate</button>
            </div>
            {predictions?.data?.predictions ? (
              Object.entries(predictions.data.predictions).map(([cat, p]) => (
                <div key={cat} style={{
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12, padding: 14, marginBottom: 10,
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <p style={{ ...kicker, color: '#7db8f7' }}>{cat}</p>
                  <p style={{ color: '#eef0f5', fontWeight: 600, marginTop: 6 }}>{p.teaser}</p>
                  <p style={{ ...dim, whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.full}</p>
                  {p.punch ? <p style={{ color: '#c9a96e', fontStyle: 'italic', marginTop: 6 }}>"{p.punch}"</p> : null}
                  {p.timing ? <p style={muted}>⏳ {p.timing}</p> : null}
                  {p.action ? <p style={{ ...muted, marginTop: 4 }}>→ {p.action}</p> : null}
                </div>
              ))
            ) : (
              <p style={dim}>No predictions cached for today. Run the worker to generate.</p>
            )}
          </div>
        )}

        {/* How rotation works */}
        {authed && (
          <div style={card}>
            <p style={kicker}>How rotation works</p>
            <ol style={{ ...dim, lineHeight: 1.7, paddingLeft: 18 }}>
              <li>Every device deterministically picks one of 52 entries per category from the local pool, using the date as the seed.</li>
              <li>The local pool guarantees no entry repeats within 14 days for the same install.</li>
              <li>Optionally, a daily LLM job (run from your machine via Ollama) generates 4 fresh entries (one per category) and stores them in Upstash Redis.</li>
              <li>The mobile app fetches <code>/api/predictions/daily</code>; if Redis has fresh data it overrides the local pick. Otherwise it falls back to local.</li>
              <li>Trigger the worker manually: <code>cd backend &amp;&amp; node scripts/run-daily-predictions.js</code> (Ollama must be running locally).</li>
            </ol>
          </div>
        )}
      </main>
    </>
  );
}
