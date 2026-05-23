// Server-rendered HTML for the self-service registration experience. Kept as a
// dependency-free module (no framework, no build step) so it ships with the
// same `tsup` pipeline and renders instantly — which is also better for SEO
// than a client-rendered SPA.

const BRAND = "VTOP Connector";
const TAGLINE = "Connect your VIT VTOP to ChatGPT — securely, in one click.";
const REPO_URL = "https://github.com/Vikranth-jagdish/VtopMCP";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ICONS = {
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
  lock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  key:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 9-9"/><path d="m16 6 3 3"/><path d="m18 4 3 3"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  copy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  bolt:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  github:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 5 18 5.3 18 5.3c.7 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z"/></svg>',
};

const STYLE = `
:root{
  --bg1:#eef2ff; --bg2:#f8fafc; --glow:rgba(79,70,229,.18);
  --text:#0f172a; --muted:#475569; --card:#ffffff; --card2:#f8fafc;
  --border:#e5e7eb; --ring:#6366f1;
  --brand1:#2563eb; --brand2:#6d28d9; --good:#16a34a;
  --code-bg:#0f172a; --code-fg:#e2e8f0;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg1:#0b1020; --bg2:#0b1020; --glow:rgba(99,102,241,.22);
    --text:#e5e7eb; --muted:#94a3b8; --card:#0f172a; --card2:#0b1220;
    --border:#1f2937; --ring:#818cf8;
    --brand1:#3b82f6; --brand2:#8b5cf6; --good:#22c55e;
    --code-bg:#020617; --code-fg:#e2e8f0;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;color:var(--text);
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  line-height:1.6;
  background:
    radial-gradient(900px 500px at 50% -10%,var(--glow),transparent 60%),
    linear-gradient(180deg,var(--bg1),var(--bg2));
  min-height:100vh;
}
a{color:var(--brand1)}
.wrap{max-width:760px;margin:0 auto;padding:28px 20px 64px}
header.site{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}
.brand .mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;
  background:linear-gradient(135deg,var(--brand1),var(--brand2));box-shadow:0 6px 18px -6px var(--brand2)}
.brand .mark svg{width:20px;height:20px}
.ghlink{display:inline-flex;align-items:center;gap:7px;color:var(--muted);text-decoration:none;font-size:14px;
  padding:7px 11px;border:1px solid var(--border);border-radius:10px;background:var(--card)}
.ghlink svg{width:16px;height:16px}
.ghlink:hover{color:var(--text)}
.hero{text-align:center;padding:18px 0 8px}
.pill{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--brand1);
  background:color-mix(in srgb,var(--brand1) 12%,transparent);border:1px solid color-mix(in srgb,var(--brand1) 22%,transparent);
  padding:5px 12px;border-radius:999px;margin-bottom:14px}
.pill svg{width:15px;height:15px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.03em;margin:.1em 0 .25em}
h1 .grad{background:linear-gradient(120deg,var(--brand1),var(--brand2));-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--muted);font-size:clamp(15px,2.4vw,18px);max-width:52ch;margin:0 auto}
.card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:24px;
  box-shadow:0 24px 60px -32px rgba(2,6,23,.45);margin-top:22px}
.card h2{font-size:19px;letter-spacing:-.02em;margin:0 0 6px}
.card .hint{color:var(--muted);font-size:14px;margin:0 0 18px}
form label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
.field{position:relative}
input[type=text],input[type=password]{width:100%;padding:13px 14px;font-size:16px;color:var(--text);
  background:var(--card2);border:1px solid var(--border);border-radius:12px;transition:border .15s,box-shadow .15s;outline:none}
input::placeholder{color:color-mix(in srgb,var(--muted) 70%,transparent)}
input:focus{border-color:var(--ring);box-shadow:0 0 0 4px color-mix(in srgb,var(--ring) 22%,transparent)}
.toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--muted);
  font-size:13px;font-weight:600;cursor:pointer;padding:6px 8px;border-radius:8px}
.toggle:hover{color:var(--text);background:var(--card2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:20px;
  padding:14px 18px;font-size:16px;font-weight:700;color:#fff;border:0;border-radius:12px;cursor:pointer;
  background:linear-gradient(135deg,var(--brand1),var(--brand2));box-shadow:0 14px 30px -12px var(--brand2);
  transition:transform .08s ease,filter .15s ease}
.btn:hover{filter:brightness(1.06)}
.btn:active{transform:translateY(1px)}
.btn svg{width:18px;height:18px}
.steps{display:grid;gap:14px;margin-top:8px}
@media(min-width:620px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px}
.step .n{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-weight:700;font-size:14px;color:#fff;
  background:linear-gradient(135deg,var(--brand1),var(--brand2));margin-bottom:10px}
.step h3{margin:0 0 4px;font-size:15px}
.step p{margin:0;color:var(--muted);font-size:14px}
.safe{margin-top:22px;border:1px solid color-mix(in srgb,var(--good) 30%,var(--border));
  background:color-mix(in srgb,var(--good) 7%,var(--card));border-radius:16px;padding:22px}
.safe .head{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px;margin-bottom:6px}
.safe .head .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;background:var(--good)}
.safe .head .ic svg{width:18px;height:18px}
.safe ul{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px}
.safe li{display:flex;gap:10px;font-size:14.5px;color:var(--text)}
.safe li svg{width:18px;height:18px;color:var(--good);flex:0 0 auto;margin-top:3px}
.safe .note{margin:14px 0 0;font-size:13px;color:var(--muted)}
.codebox{position:relative;margin:10px 0 0}
pre{margin:0;background:var(--code-bg);color:var(--code-fg);border-radius:12px;padding:16px 52px 16px 16px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.copy{position:absolute;top:10px;right:10px;display:inline-flex;align-items:center;gap:6px;
  background:rgba(255,255,255,.1);color:#e2e8f0;border:1px solid rgba(255,255,255,.18);border-radius:9px;
  padding:7px 10px;font-size:13px;font-weight:600;cursor:pointer}
.copy:hover{background:rgba(255,255,255,.18)}
.copy.copied{background:var(--good);border-color:var(--good);color:#fff}
.copy svg{width:15px;height:15px}
.result-icon{width:60px;height:60px;border-radius:16px;display:grid;place-items:center;color:#fff;margin:0 auto 8px;
  background:linear-gradient(135deg,var(--good),#15803d);box-shadow:0 16px 34px -14px var(--good)}
.result-icon svg{width:32px;height:32px}
ol.flow{padding-left:0;list-style:none;counter-reset:s;margin:6px 0 0}
ol.flow li{counter-increment:s;position:relative;padding:4px 0 18px 40px}
ol.flow li::before{content:counter(s);position:absolute;left:0;top:2px;width:26px;height:26px;border-radius:8px;
  display:grid;place-items:center;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,var(--brand1),var(--brand2))}
details{margin-top:18px;border:1px solid var(--border);border-radius:12px;background:var(--card2);padding:0 16px}
summary{cursor:pointer;font-weight:600;font-size:14px;padding:14px 0}
.warn{margin-top:18px;font-size:13.5px;color:var(--muted);border-left:3px solid #f59e0b;padding-left:12px}
code.inline{background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:1px 6px;font-size:13px}
footer.site{text-align:center;color:var(--muted);font-size:13px;margin-top:30px}
footer.site a{color:var(--muted)}
.center{text-align:center}
.mt{margin-top:18px}
`;

interface LayoutOpts {
  title: string;
  description: string;
  origin: string;
  canonicalPath: string;
  body: string;
  noindex?: boolean;
}

function layout(o: LayoutOpts): string {
  const canonical = `${o.origin}${o.canonicalPath}`;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: BRAND,
    description: o.description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    url: o.origin,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  });
  const favicon =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#4f46e5"/><path d="M12 4 5 6.6V12c0 4 7 7.4 7 7.4S19 16 19 12V6.6L12 4z" fill="none" stroke="#fff" stroke-width="1.6"/><path d="m9 12 2 2 4-4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    );
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${escapeHtml(o.description)}">
<meta name="keywords" content="VTOP, VIT, ChatGPT, MCP, connector, attendance, timetable, CGPA, VIT Chennai, vtopcc">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="${o.noindex ? "noindex,nofollow" : "index,follow"}">
<meta name="theme-color" content="#4f46e5">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${escapeHtml(o.title)}">
<meta property="og:description" content="${escapeHtml(o.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(o.origin)}/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(o.title)}">
<meta name="twitter:description" content="${escapeHtml(o.description)}">
<meta name="twitter:image" content="${escapeHtml(o.origin)}/og.svg">
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
<script type="application/ld+json">${jsonLd}</script>
<style>${STYLE}</style>
</head><body><div class="wrap">
<header class="site">
  <div class="brand"><span class="mark">${ICONS.shield}</span><span>${BRAND}</span></div>
  <a class="ghlink" href="${REPO_URL}" target="_blank" rel="noopener">${ICONS.github}<span>Open source</span></a>
</header>
${o.body}
<footer class="site">
  <p>${BRAND} · open-source MCP server for VIT VTOP · <a href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a></p>
</footer>
</div>
<script>
document.addEventListener("click",function(e){
  var c=e.target.closest("[data-copy]");
  if(c){navigator.clipboard.writeText(c.getAttribute("data-copy")).then(function(){
    c.classList.add("copied");var s=c.querySelector("span");var t=s?s.textContent:c.textContent;
    if(s)s.textContent="Copied!";setTimeout(function(){c.classList.remove("copied");if(s)s.textContent=t;},1800);
  });}
  var t=e.target.closest("[data-toggle]");
  if(t){var inp=document.getElementById(t.getAttribute("data-toggle"));
    if(inp){var p=inp.type==="password";inp.type=p?"text":"password";t.textContent=p?"Hide":"Show";}}
});
</script>
</body></html>`;
}

function howItWorks(): string {
  return `<div class="steps">
  <div class="step"><div class="n">1</div><h3>Enter your VTOP login</h3><p>Just once, on this page — never inside the chat.</p></div>
  <div class="step"><div class="n">2</div><h3>Get a private link</h3><p>We hand you a personal connector URL with your credentials encrypted inside it.</p></div>
  <div class="step"><div class="n">3</div><h3>Paste it into ChatGPT</h3><p>Add it as a connector with “No Auth”. Then just ask “What’s my attendance?”</p></div>
</div>`;
}

function safetySection(): string {
  const item = (t: string) => `<li>${ICONS.check}<span>${t}</span></li>`;
  return `<div class="safe">
  <div class="head"><span class="ic">${ICONS.lock}</span><span>Is this safe?</span></div>
  <p style="margin:0;color:var(--muted);font-size:14.5px">Built privacy-first. Here's exactly what happens to your password:</p>
  <ul>
    ${item("<strong>Encrypted, not stored.</strong> Your credentials are sealed with AES-256-GCM into the link itself. There is no database — nothing about you is saved on the server.")}
    ${item("<strong>Never typed into chat.</strong> You log in here, on a normal web page over HTTPS — so your password is never exposed to the AI model.")}
    ${item("<strong>Only your link works.</strong> The link is yours alone, and you can invalidate it anytime by asking the operator to rotate the server secret.")}
    ${item("<strong>Open source.</strong> Every line is public — read exactly what the server does before you trust it.")}
  </ul>
  <p class="note">Honest note: like any tool that logs in <em>for</em> you, the person running this server technically holds the key that can decrypt links. Only register on a deployment you trust (ideally your own).</p>
</div>`;
}

export function landingPage(origin: string, canonicalPath: string): string {
  const body = `<section class="hero">
  <span class="pill">${ICONS.bolt} Set up in under a minute</span>
  <h1>Bring your <span class="grad">VTOP</span> into ChatGPT</h1>
  <p class="sub">${escapeHtml(TAGLINE)} Ask for your attendance, marks, timetable, exam schedule and CGPA — in plain English.</p>
</section>
<section class="card" aria-labelledby="form-h">
  <h2 id="form-h">${ICONS.key} Generate your connector link</h2>
  <p class="hint">Enter your VTOP credentials below. They're encrypted into your personal link and never stored.</p>
  <form method="POST" action="/register" autocomplete="off">
    <label for="username">VTOP username / registration number</label>
    <div class="field"><input id="username" name="username" type="text" placeholder="e.g. 22BCE1234" autocomplete="off" required></div>
    <label for="password">VTOP password</label>
    <div class="field">
      <input id="password" name="password" type="password" placeholder="Your VTOP password" autocomplete="off" required>
      <button type="button" class="toggle" data-toggle="password">Show</button>
    </div>
    <button class="btn" type="submit">${ICONS.bolt} Generate my link</button>
  </form>
</section>
<section class="mt" aria-label="How it works">
  <h2 class="center" style="letter-spacing:-.02em;margin:26px 0 14px">How it works</h2>
  ${howItWorks()}
</section>
<section>${safetySection()}</section>`;
  return layout({
    title: `${BRAND} — Connect VIT VTOP to ChatGPT`,
    description:
      "Securely connect your VIT VTOP account to ChatGPT. Ask for your attendance, marks, timetable, exam schedule and CGPA in plain English. Credentials are encrypted, never stored.",
    origin,
    canonicalPath,
    body,
  });
}

export function resultPage(opts: {
  origin: string;
  connectorUrl: string;
  baseMcpUrl: string;
  token: string;
}): string {
  const safeUrl = escapeHtml(opts.connectorUrl);
  const safeBase = escapeHtml(opts.baseMcpUrl);
  const body = `<section class="hero">
  <div class="result-icon">${ICONS.check}</div>
  <h1 style="font-size:clamp(24px,4vw,32px)">Your connector is ready</h1>
  <p class="sub">Copy your private link and add it to ChatGPT. That's it.</p>
</section>
<section class="card">
  <ol class="flow">
    <li><strong>Copy your connector URL</strong>
      <div class="codebox"><pre>${safeUrl}</pre>
        <button class="copy" data-copy="${safeUrl}">${ICONS.copy}<span>Copy</span></button></div>
    </li>
    <li><strong>In ChatGPT:</strong> Settings → Connectors → <em>Create</em>. Paste the URL above as the <em>MCP Server URL</em> and set <strong>Authentication: No Auth</strong>.</li>
    <li><strong>Start asking.</strong> Enable the connector in a chat and try <em>“What's my attendance?”</em></li>
  </ol>
  <details>
    <summary>Using Claude Desktop or Cursor instead?</summary>
    <p style="font-size:14px;color:var(--muted)">Those clients support auth headers. Use the base URL <code class="inline">${safeBase}</code> and add header <code class="inline">Authorization: Bearer &lt;token&gt;</code> with this token:</p>
    <div class="codebox"><pre>${escapeHtml(opts.token)}</pre>
      <button class="copy" data-copy="${escapeHtml(opts.token)}">${ICONS.copy}<span>Copy</span></button></div>
  </details>
  <p class="warn">Keep this link private — anyone who has it can read your VTOP data. To revoke it, ask the operator to rotate <code class="inline">CONNECTOR_SECRET</code> (this invalidates all links).</p>
  <p class="center mt"><a href="/register">← Generate another link</a></p>
</section>`;
  return layout({
    title: `Your connector link — ${BRAND}`,
    description: "Your personal VTOP connector link is ready to add to ChatGPT.",
    origin: opts.origin,
    canonicalPath: "/register",
    body,
    noindex: true,
  });
}

export function unavailablePage(origin: string, message: string): string {
  const body = `<section class="hero">
  <h1 style="font-size:clamp(24px,4vw,32px)">Registration unavailable</h1>
  <p class="sub">${escapeHtml(message)}</p>
</section>`;
  return layout({
    title: `Unavailable — ${BRAND}`,
    description: "Self-service registration is not enabled on this deployment.",
    origin,
    canonicalPath: "/register",
    body,
    noindex: true,
  });
}

export function ogImageSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>
<rect width="1200" height="630" fill="#0b1020"/>
<circle cx="980" cy="-40" r="320" fill="url(#g)" opacity="0.35"/>
<g transform="translate(96,210)">
<rect width="76" height="76" rx="20" fill="url(#g)"/>
<path d="M38 14 14 22.6V40c0 14.5 24 25.4 24 25.4S62 54.5 62 40V22.6L38 14z" fill="none" stroke="#fff" stroke-width="4"/>
<path d="m29 40 6 6 12-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</g>
<text x="96" y="370" fill="#fff" font-family="Inter,Segoe UI,sans-serif" font-size="68" font-weight="700">VTOP Connector</text>
<text x="96" y="440" fill="#94a3b8" font-family="Inter,Segoe UI,sans-serif" font-size="34">Connect your VIT VTOP to ChatGPT — securely.</text>
<text x="96" y="540" fill="#cbd5e1" font-family="Inter,Segoe UI,sans-serif" font-size="26">Attendance · Marks · Timetable · Exams · CGPA</text>
</svg>`;
}

export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /$\nAllow: /register$\nDisallow: /mcp\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sitemapXml(origin: string): string {
  const urls = ["/", "/register"];
  const body = urls
    .map((u) => `  <url><loc>${origin}${u}</loc><changefreq>monthly</changefreq></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
