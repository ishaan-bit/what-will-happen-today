export default function PrivacyPolicy() {
  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07080f; color: #c8c8d8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px 20px 64px; }
        .wrap { max-width: 680px; margin: 0 auto; }
        .kicker { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #a78bfa; margin-bottom: 8px; }
        h1 { font-size: 28px; color: #f0f0fa; font-weight: 700; margin-bottom: 24px; }
        h2 { font-size: 16px; color: #f0f0fa; font-weight: 600; margin-top: 28px; margin-bottom: 10px; }
        p { font-size: 15px; line-height: 1.6; color: #9898b0; margin-bottom: 14px; }
        ul { padding-left: 0; list-style: none; margin-bottom: 14px; }
        li { font-size: 15px; line-height: 1.6; color: #9898b0; padding-left: 18px; position: relative; margin-bottom: 6px; }
        li::before { content: '\\2022'; position: absolute; left: 0; color: #a78bfa; }
        footer { font-size: 12px; color: #555570; margin-top: 40px; font-style: italic; }
        a { color: #a78bfa; }
      `}</style>
      <div className="wrap">
        <p className="kicker">WWHT PRIVACY POLICY</p>
        <h1>Privacy Policy</h1>

        <p>
          What Will Happen Today is a daily prediction experience published by QuietDen (OPC)
          Private Limited. We collect the minimum data required to deliver daily readings,
          verify in-app purchases, and keep the service stable.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>An anonymous device identifier stored locally on your device.</li>
          <li>Local prediction history so we don't repeat the same reading too soon.</li>
          <li>In-app purchase tokens and Google Play transaction metadata for verification.</li>
          <li>Anonymous diagnostic and product analytics events (e.g. PostHog), no personal content.</li>
        </ul>

        <h2>How we use data</h2>
        <ul>
          <li>Generate, rotate, and personalize today's reading.</li>
          <li>Verify that an unlock has been purchased and grant access to all four signals.</li>
          <li>Diagnose crashes, monitor service health, and improve reliability.</li>
        </ul>

        <h2>Data handling</h2>
        <ul>
          <li>Most state is held only on your device via local storage.</li>
          <li>Server-side data sits in Upstash Redis under app-specific keys.</li>
          <li>All transport runs over HTTPS in production.</li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>The app works fully without an account.</li>
          <li>You can uninstall at any time to remove all local data.</li>
          <li>
            You can request deletion of any server-side data by emailing{' '}
            <a href="mailto:qdenxp@gmail.com">qdenxp@gmail.com</a>.
          </li>
        </ul>

        <h2>Sharing</h2>
        <p>
          We use trusted processors to operate the service: Vercel, Upstash Redis, Google Play
          Billing, PostHog, and Sentry. We do not sell personal data.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy requests, contact <a href="mailto:qdenxp@gmail.com">qdenxp@gmail.com</a>.
        </p>

        <footer>Last updated: April 22, 2026.</footer>
      </div>
    </>
  );
}
