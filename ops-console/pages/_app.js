export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body {
          margin: 0; padding: 0;
          background: #0a0a0f; color: #e8e8f0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px;
        }
        a { color: #8ab4ff; text-decoration: none; }
        button {
          font-family: inherit; font-size: 13px;
          padding: 8px 14px; border-radius: 6px;
          border: 1px solid #2a2a35; background: #1a1a22; color: #e8e8f0;
          cursor: pointer; transition: all 0.15s;
        }
        button:hover:not(:disabled) { background: #252530; border-color: #3a3a48; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        button.primary { background: #4a5cff; border-color: #4a5cff; color: white; }
        button.primary:hover:not(:disabled) { background: #5b6dff; }
        button.danger { background: #2a1a22; border-color: #4a2a35; color: #ff8aa0; }
        input {
          font-family: inherit; font-size: 13px;
          padding: 8px 12px; border-radius: 6px;
          border: 1px solid #2a2a35; background: #0f0f17; color: #e8e8f0;
          width: 100%;
        }
        input:focus { outline: none; border-color: #4a5cff; }
        pre {
          background: #0f0f17; border: 1px solid #1a1a22;
          padding: 12px; border-radius: 6px; overflow: auto;
          font-size: 12px; line-height: 1.5;
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
