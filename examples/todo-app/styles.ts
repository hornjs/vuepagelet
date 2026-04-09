export const todoShowcaseStyleSheet = `
  :root {
    color-scheme: dark;
    --bg: #08111f;
    --bg-accent: #15273d;
    --panel: rgba(10, 20, 36, 0.82);
    --panel-strong: rgba(6, 15, 28, 0.94);
    --line: rgba(138, 179, 255, 0.18);
    --text: #eff6ff;
    --muted: #a7b6cc;
    --signal: #7dd3fc;
    --signal-strong: #22d3ee;
    --warm: #f59e0b;
    --ok: #34d399;
    --shadow: 0 30px 90px rgba(2, 6, 23, 0.45);
    font-family: "Avenir Next", "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  html {
    min-height: 100%;
    background:
      radial-gradient(circle at top, rgba(34, 211, 238, 0.18), transparent 38%),
      radial-gradient(circle at 80% 10%, rgba(245, 158, 11, 0.18), transparent 24%),
      linear-gradient(180deg, #09111f 0%, #050915 100%);
    color: var(--text);
  }

  body {
    margin: 0;
    min-height: 100vh;
    color: var(--text);
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .todo-shell {
    width: min(1120px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 32px 0 56px;
  }

  .todo-hero {
    position: relative;
    overflow: hidden;
    margin-bottom: 24px;
    padding: 28px;
    border: 1px solid var(--line);
    border-radius: 28px;
    background:
      linear-gradient(135deg, rgba(12, 31, 54, 0.96), rgba(7, 16, 30, 0.92)),
      var(--panel);
    box-shadow: var(--shadow);
  }

  .todo-hero::after {
    content: "";
    position: absolute;
    inset: auto -10% -45% auto;
    width: 320px;
    height: 320px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(34, 211, 238, 0.22), transparent 68%);
    pointer-events: none;
  }

  .todo-kicker,
  .todo-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(125, 211, 252, 0.24);
    border-radius: 999px;
    background: rgba(125, 211, 252, 0.08);
    color: var(--signal);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .todo-kicker {
    padding: 8px 12px;
  }

  .todo-chip {
    padding: 7px 11px;
  }

  .todo-title {
    margin: 18px 0 12px;
    font-size: clamp(2.5rem, 6vw, 4.8rem);
    line-height: 0.92;
    letter-spacing: -0.05em;
  }

  .todo-subtitle,
  .todo-copy,
  .todo-nav-path,
  .todo-panel p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }

  .todo-status-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 20px;
  }

  .todo-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }

  .todo-nav-link {
    display: block;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: rgba(7, 15, 27, 0.78);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
    transition:
      transform 140ms ease,
      border-color 140ms ease,
      background 140ms ease;
  }

  .todo-nav-link:hover {
    transform: translateY(-1px);
    border-color: rgba(125, 211, 252, 0.34);
    background: rgba(11, 24, 41, 0.94);
  }

  .todo-nav-link.router-link-active,
  .todo-nav-link.router-link-exact-active {
    border-color: rgba(34, 211, 238, 0.55);
    background: linear-gradient(135deg, rgba(34, 211, 238, 0.16), rgba(245, 158, 11, 0.12));
  }

  .todo-nav-label {
    display: block;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .todo-nav-path {
    display: block;
    margin-top: 4px;
    font-size: 0.75rem;
  }

  .todo-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
    gap: 18px;
  }

  .todo-panel {
    padding: 24px;
    border: 1px solid var(--line);
    border-radius: 24px;
    background: var(--panel-strong);
    box-shadow: var(--shadow);
  }

  .todo-panel h2,
  .todo-panel h3 {
    margin: 14px 0 10px;
    letter-spacing: -0.03em;
  }

  .todo-bullets {
    margin: 14px 0 0;
    padding-left: 18px;
    color: var(--muted);
    line-height: 1.7;
  }

  .todo-stack {
    display: grid;
    gap: 18px;
  }

  @media (max-width: 820px) {
    .todo-shell {
      width: min(100vw - 20px, 1120px);
      padding-top: 20px;
    }

    .todo-hero,
    .todo-panel {
      padding: 20px;
      border-radius: 22px;
    }

    .todo-grid {
      grid-template-columns: 1fr;
    }
  }
`;
