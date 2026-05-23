// Server-rendered HTML for the registration experience. Dependency-free (no
// framework, no build step) so it ships with the same `tsup` pipeline, renders
// instantly, and stays fully crawlable for SEO.
//
// Design language: editorial / Swiss-influenced. Warm paper, ink type, a
// characterful serif display face against a clean sans and a mono for technical
// detail, hairline rules instead of shadows, near-monochrome with a single
// restrained accent. Light + dark via prefers-color-scheme.

const BRAND = "VTOP Connector";
const REPO_URL = "https://github.com/Vikranth-jagdish/VtopMCP";
const AUTHOR_URL = "https://www.vikranth.space/labs/vtop-mcp";
const AUTHOR_URL_TEXT = "vikranth.space/labs/vtop-mcp";
const AUTHOR_NAME = "Vikranth";
const NPM_PKG = "@vikranth2005/vtop-mcp";
const NPM_URL = "https://www.npmjs.com/package/@vikranth2005/vtop-mcp";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const checkIcon =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 4.5 6.5 12 2.5 8"/></svg>';
const copyIcon =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8.5" height="8.5" rx="1.6"/><path d="M3.5 10H2.7A1.2 1.2 0 0 1 1.5 8.8V2.7A1.2 1.2 0 0 1 2.7 1.5h6.1A1.2 1.2 0 0 1 10 2.7v.8"/></svg>';
const arrowIcon =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

const STYLE = `
:root{
  color-scheme:light dark;
  --paper:#f6f4ee; --raise:#fbfaf6; --ink:#1b1a16; --soft:#54524a; --faint:#8c897e;
  --line:#e1ddd1; --line2:#d5d0c2; --code-bg:#efece2; --code-ink:#2a2820;
  --accent:#bf3d24; --btn-bg:#1b1a16; --btn-ink:#f6f4ee; --ring:rgba(27,26,22,.18);
  --grain:.04;
}
@media (prefers-color-scheme:dark){
  :root{
    --paper:#0c0c0d; --raise:#141416; --ink:#ecebe6; --soft:#a3a097; --faint:#6f6d65;
    --line:#232326; --line2:#2c2c30; --code-bg:#161618; --code-ink:#e7e6e1;
    --accent:#ff6a4d; --btn-bg:#ecebe6; --btn-ink:#0c0c0d; --ring:rgba(236,235,230,.16);
    --grain:.05;
  }
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{
  background:var(--paper);color:var(--ink);
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:17px;line-height:1.6;letter-spacing:-.01em;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  min-height:100vh;position:relative;
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:1;opacity:var(--grain);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.wrap{position:relative;z-index:2;max-width:680px;margin:0 auto;padding:0 24px}
.serif{font-family:"Instrument Serif",Georgia,"Times New Roman",serif;font-weight:400;letter-spacing:0}
.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.eyebrow{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11.5px;font-weight:500;
  text-transform:uppercase;letter-spacing:.22em;color:var(--faint)}
a{color:inherit;text-decoration:none}
em{font-style:italic}

/* header */
header.bar{display:flex;align-items:center;justify-content:space-between;padding:26px 0 0}
.wordmark{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;letter-spacing:-.01em}
.dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.bar nav{display:flex;gap:22px;font-size:13.5px;color:var(--soft)}
.bar nav a{position:relative;padding-bottom:2px}
.bar nav a:hover{color:var(--ink)}
.bar nav a::after{content:"";position:absolute;left:0;right:100%;bottom:0;height:1px;background:var(--ink);transition:right .25s ease}
.bar nav a:hover::after{right:0}

/* hero */
.hero{padding:64px 0 8px}
.hero h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;
  font-size:clamp(3rem,9vw,5.4rem);line-height:.96;letter-spacing:-.015em;margin:18px 0 0}
.hero h1 em{color:var(--accent)}
.lede{margin-top:22px;max-width:30em;color:var(--soft);font-size:clamp(16px,2.4vw,19px);line-height:1.55}

/* sections */
section{padding:30px 0}
.rule{height:1px;background:var(--line);border:0}
.kicker{display:flex;align-items:center;gap:12px;margin-bottom:26px}
.kicker h2{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:clamp(1.7rem,4vw,2.3rem);letter-spacing:-.01em}
.kicker .line{flex:1;height:1px;background:var(--line)}

/* form panel */
.panel{border:1px solid var(--line);border-radius:16px;background:var(--raise);padding:28px}
.panel .lead{color:var(--soft);font-size:14.5px;margin:-2px 0 22px}
.label{display:block;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;font-weight:500;
  text-transform:uppercase;letter-spacing:.16em;color:var(--faint);margin:18px 0 8px}
.field{position:relative}
input[type=text],input[type=password]{width:100%;padding:14px 15px;font-size:16px;color:var(--ink);
  background:var(--paper);border:1px solid var(--line2);border-radius:11px;outline:none;
  font-family:inherit;letter-spacing:-.01em;transition:border-color .15s,box-shadow .15s}
input::placeholder{color:var(--faint)}
input:focus{border-color:var(--ink);box-shadow:0 0 0 4px var(--ring)}
.toggle{position:absolute;right:7px;top:50%;transform:translateY(-50%);border:0;background:transparent;cursor:pointer;
  font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);
  padding:7px 9px;border-radius:8px}
.toggle:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;width:100%;margin-top:24px;
  padding:15px 20px;font-size:15px;font-weight:600;letter-spacing:-.01em;cursor:pointer;
  color:var(--btn-ink);background:var(--btn-bg);border:1px solid var(--btn-bg);border-radius:11px;
  transition:transform .08s ease,opacity .15s ease}
.btn:hover{opacity:.9}
.btn:active{transform:translateY(1px)}
.btn svg{width:15px;height:15px}

/* steps */
ol.steps{list-style:none}
ol.steps li{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start;
  padding:22px 0;border-top:1px solid var(--line)}
ol.steps li:last-child{border-bottom:1px solid var(--line)}
ol.steps .num{font-family:"Instrument Serif",Georgia,serif;font-size:2rem;line-height:1;color:var(--accent);font-feature-settings:"tnum"}
ol.steps h3{font-size:16px;font-weight:600;letter-spacing:-.01em;margin-bottom:3px}
ol.steps p{color:var(--soft);font-size:14.5px;line-height:1.55}
ol.steps em{font-style:italic}

/* safety */
.safelist{list-style:none;display:grid;gap:16px}
.safelist li{display:grid;grid-template-columns:auto 1fr;gap:13px;align-items:start}
.safelist .ic{width:21px;height:21px;border:1px solid var(--line2);border-radius:7px;display:grid;place-items:center;color:var(--accent);margin-top:2px}
.safelist .ic svg{width:12px;height:12px}
.safelist b{font-weight:600}
.safelist span{color:var(--soft);font-size:15px}
.safelist span b{color:var(--ink)}
.note{margin-top:22px;padding-top:18px;border-top:1px solid var(--line);color:var(--faint);font-size:13.5px;line-height:1.6}

.textlink{color:var(--ink);border-bottom:1px solid var(--accent);padding-bottom:1px;white-space:nowrap}
.textlink:hover{color:var(--accent)}
.navpath{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:10px}
.navpath span{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;background:var(--code-bg);
  border:1px solid var(--line);border-radius:7px;padding:5px 9px;color:var(--ink)}
.navpath span:not(:last-child)::after{content:"→";margin-left:8px;color:var(--accent);font-weight:700}
.navpath span:last-child{border-color:var(--accent);color:var(--accent)}

/* code / result */
.codebox{position:relative;margin-top:10px}
pre{background:var(--code-bg);color:var(--code-ink);border:1px solid var(--line);border-radius:12px;
  padding:16px 58px 16px 16px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:13px;
  line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.copy{position:absolute;top:9px;right:9px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;
  background:var(--paper);color:var(--soft);border:1px solid var(--line2);border-radius:8px;
  padding:7px 10px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  transition:color .15s,border-color .15s}
.copy:hover{color:var(--ink);border-color:var(--ink)}
.copy.copied{color:var(--accent);border-color:var(--accent)}
.copy svg{width:13px;height:13px}
.ready{display:inline-flex;align-items:center;gap:9px;color:var(--accent);font-family:"JetBrains Mono",monospace;
  font-size:11.5px;letter-spacing:.22em;text-transform:uppercase}
details{margin-top:22px;border-top:1px solid var(--line);padding-top:6px}
summary{cursor:pointer;font-size:14px;color:var(--soft);padding:14px 0;list-style:none}
summary:hover{color:var(--ink)}
summary::-webkit-details-marker{display:none}
summary::before{content:"+ ";font-family:"JetBrains Mono",monospace;color:var(--accent)}
details[open] summary::before{content:"– "}
code.in{font-family:"JetBrains Mono",monospace;font-size:.86em;background:var(--code-bg);
  border:1px solid var(--line);border-radius:5px;padding:1px 5px}

.backlink{display:inline-flex;align-items:center;gap:7px;margin-top:28px;font-size:14px;color:var(--soft)}
.backlink:hover{color:var(--ink)}
.backlink svg{width:14px;height:14px}

/* footer */
footer.foot{margin-top:40px;padding:26px 0 56px;border-top:1px solid var(--line);
  display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:center;
  font-size:13px;color:var(--faint)}
footer.foot a{color:var(--soft)}
footer.foot a:hover{color:var(--ink)}
footer.foot .links{display:flex;gap:20px;align-items:center}
footer.foot .by b{color:var(--ink);font-weight:600}

@media(max-width:560px){
  .bar nav a:not(.gh){display:none}
  ol.steps .num{font-size:1.6rem}
}
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
    author: { "@type": "Person", name: AUTHOR_NAME, url: AUTHOR_URL },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  });
  const favicon =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="%231b1a16"/><text x="16" y="23" font-family="Georgia,serif" font-size="20" fill="%23f6f4ee" text-anchor="middle">V</text><circle cx="25" cy="8" r="3.4" fill="%23bf3d24"/></svg>',
    );
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(o.title)}</title>
<meta name="description" content="${escapeHtml(o.description)}">
<meta name="keywords" content="VTOP, VIT, ChatGPT, MCP, connector, attendance, timetable, CGPA, VIT Chennai, vtopcc">
<meta name="author" content="${AUTHOR_NAME}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="${o.noindex ? "noindex,nofollow" : "index,follow"}">
<meta name="theme-color" content="#f6f4ee" media="(prefers-color-scheme:light)">
<meta name="theme-color" content="#0c0c0d" media="(prefers-color-scheme:dark)">
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap">
<script type="application/ld+json">${jsonLd}</script>
<style>${STYLE}</style>
</head><body><div class="wrap">
<header class="bar">
  <a class="wordmark" href="/"><span class="dot"></span>VTOP&nbsp;Connector</a>
  <nav>
    <a href="#how">How it works</a>
    <a href="#safe">Safety</a>
    <a class="gh" href="${REPO_URL}" target="_blank" rel="noopener">GitHub&nbsp;↗</a>
  </nav>
</header>
${o.body}
<footer class="foot">
  <span class="by">Built by <a href="${AUTHOR_URL}" target="_blank" rel="noopener"><b>${AUTHOR_NAME}</b></a></span>
  <span class="links">
    <a href="${AUTHOR_URL}" target="_blank" rel="noopener">Portfolio ↗</a>
    <a href="${REPO_URL}" target="_blank" rel="noopener">Source ↗</a>
    <span>MIT</span>
  </span>
</footer>
</div>
<script>
document.addEventListener("click",function(e){
  var c=e.target.closest("[data-copy]");
  if(c){navigator.clipboard.writeText(c.getAttribute("data-copy")).then(function(){
    c.classList.add("copied");var s=c.querySelector("span");var t=s?s.textContent:"";
    if(s)s.textContent="Copied";setTimeout(function(){c.classList.remove("copied");if(s)s.textContent=t;},1700);
  });}
  var t=e.target.closest("[data-toggle]");
  if(t){var i=document.getElementById(t.getAttribute("data-toggle"));
    if(i){var p=i.type==="password";i.type=p?"text":"password";t.textContent=p?"Hide":"Show";}}
});
</script>
</body></html>`;
}

function howItWorks(): string {
  const step = (n: string, h: string, p: string) =>
    `<li><span class="num">${n}</span><div><h3>${h}</h3><p>${p}</p></div></li>`;
  return `<section id="how">
  <div class="kicker"><h2 class="serif">How it works</h2><span class="line"></span></div>
  <ol class="steps">
    ${step("01", "Enter your VTOP login", "Once, on this page — never inside a chat window.")}
    ${step("02", "Get a private link", "Your credentials are encrypted into a connector URL that's yours alone.")}
    ${step("03", "Add it to ChatGPT", "On a paid plan, turn on <em>Developer mode</em>, create an app with <em>No&nbsp;Auth</em>, then ask “what's my attendance?” — full steps come next.")}
  </ol>
</section>`;
}

function safety(): string {
  const li = (b: string, rest: string) =>
    `<li><span class="ic">${checkIcon}</span><span><b>${b}</b> ${rest}</span></li>`;
  return `<section id="safe">
  <div class="kicker"><h2 class="serif">Built to be safe</h2><span class="line"></span></div>
  <ul class="safelist">
    ${li("Encrypted, never stored.", "Your credentials are sealed with AES-256-GCM <em>inside the link itself</em>. There's no database — nothing about you is saved on the server.")}
    ${li("Never typed into chat.", "You sign in here, on a normal page over HTTPS, so your password is never exposed to the AI model.")}
    ${li("Only your link works.", "The link is yours alone, and it can be invalidated anytime by rotating the server's secret.")}
    ${li("Fully open source.", "Every line is public — read exactly what runs before you trust it.")}
  </ul>
</section>`;
}

function buildYourOwn(): string {
  return `<section id="build">
  <div class="kicker"><h2 class="serif">Use it in your own project</h2><span class="line"></span></div>
  <p style="color:var(--soft);max-width:46em">VtopMCP is free and open source. Download the npm package and wire it into your own personal project, or read the full write-up on Vikranth's site.</p>
  <div class="codebox" style="margin-top:14px">
    <pre>npm install ${NPM_PKG}</pre>
    <button class="copy" data-copy="npm install ${NPM_PKG}">${copyIcon}<span>Copy</span></button>
  </div>
  <p style="margin-top:16px;font-size:15px;color:var(--soft)">
    <a class="textlink" href="${NPM_URL}" target="_blank" rel="noopener">npmjs.com/package/${NPM_PKG}</a>
    &nbsp;·&nbsp;
    <a class="textlink" href="${AUTHOR_URL}" target="_blank" rel="noopener">${AUTHOR_URL_TEXT}</a>
  </p>
</section>`;
}

export function landingPage(origin: string, canonicalPath: string): string {
  const body = `<section class="hero">
  <span class="eyebrow">MCP connector · VIT VTOP</span>
  <h1>Your VTOP,<br>now in <em>ChatGPT</em>.</h1>
  <p class="lede">Generate a private connector link and ask for your attendance, marks, timetable, exams and CGPA — in plain English.</p>
</section>
<section>
  <div class="panel">
    <div class="kicker" style="margin-bottom:6px"><h2 class="serif" style="font-size:1.5rem">Create your link</h2></div>
    <p class="lead">Your VTOP credentials are encrypted into the link and never stored.</p>
    <form method="POST" action="/register" autocomplete="off">
      <label class="label" for="username">VTOP username</label>
      <div class="field"><input id="username" name="username" type="text" placeholder="e.g. 22BCE1234" autocomplete="off" required></div>
      <label class="label" for="password">VTOP password</label>
      <div class="field">
        <input id="password" name="password" type="password" placeholder="••••••••" autocomplete="off" required>
        <button type="button" class="toggle" data-toggle="password">Show</button>
      </div>
      <button class="btn" type="submit">Generate my link ${arrowIcon}</button>
    </form>
  </div>
</section>
${howItWorks()}
${safety()}
${buildYourOwn()}`;
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
  const body = `<section class="hero" style="padding-bottom:0">
  <span class="ready"><span class="dot"></span>Link ready</span>
  <h1 style="font-size:clamp(2.4rem,7vw,4rem)">Your connector<br>is <em>live</em>.</h1>
  <p class="lede">Copy your private link and add it to ChatGPT. That's the whole setup.</p>
</section>
<section>
  <span class="label" style="margin-top:0">Your connector URL</span>
  <div class="codebox">
    <pre>${safeUrl}</pre>
    <button class="copy" data-copy="${safeUrl}">${copyIcon}<span>Copy</span></button>
  </div>
</section>
<section id="how" style="padding-top:8px">
  <div class="kicker"><h2 class="serif">How to set it up in ChatGPT</h2><span class="line"></span></div>
  <ol class="steps">
    <li><span class="num">01</span><div><h3>Use a paid ChatGPT plan</h3><p>This needs ChatGPT <strong>Go</strong>, <strong>Plus</strong>, or <strong>Pro</strong>. It does not work on the free plan.</p></div></li>
    <li><span class="num">02</span><div><h3>Turn on Developer mode</h3><p>Open ChatGPT and follow this path:</p><div class="navpath"><span>Profile</span><span>Settings</span><span>Apps</span><span>Developer mode = ON</span></div></div></li>
    <li><span class="num">03</span><div><h3>Create the app</h3><p>Click <strong>Create</strong>. Then:</p><p style="margin-top:6px">• <strong>Name:</strong> VtopMCP<br>• <strong>MCP Server URL:</strong> paste the link from the top of this page<br>• <strong>Authentication:</strong> No&nbsp;Auth</p><p style="margin-top:6px">Click Create to save.</p></div></li>
    <li><span class="num">04</span><div><h3>Ask a question</h3><p>Open a new chat, turn on <strong>VtopMCP</strong>, and ask <em>“what's my attendance?”</em></p></div></li>
  </ol>
  <details>
    <summary>Using Claude Desktop or Cursor instead?</summary>
    <p style="color:var(--soft);font-size:14px;margin-bottom:4px">Those clients support auth headers. Use the base URL <code class="in">${safeBase}</code> with header <code class="in">Authorization: Bearer &lt;token&gt;</code>, where the token is:</p>
    <div class="codebox">
      <pre>${escapeHtml(opts.token)}</pre>
      <button class="copy" data-copy="${escapeHtml(opts.token)}">${copyIcon}<span>Copy</span></button>
    </div>
  </details>
  <p class="note">Keep this link private — anyone who has it can read your VTOP data. To revoke it, rotate <code class="in">CONNECTOR_SECRET</code> on the server (invalidates all links).</p>
  <a class="backlink" href="/register">${arrowIcon} Generate another link</a>
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
  <span class="eyebrow">Single-user mode</span>
  <h1 style="font-size:clamp(2.2rem,6vw,3.4rem)">Registration is <em>off</em>.</h1>
  <p class="lede">${escapeHtml(message)}</p>
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
<rect width="1200" height="630" fill="#f6f4ee"/>
<rect x="20" y="20" width="1160" height="590" fill="none" stroke="#e1ddd1" stroke-width="2"/>
<circle cx="96" cy="118" r="9" fill="#bf3d24"/>
<text x="120" y="125" fill="#54524a" font-family="'JetBrains Mono',monospace" font-size="24" letter-spacing="5">MCP CONNECTOR · VIT VTOP</text>
<text x="92" y="320" fill="#1b1a16" font-family="Georgia,'Times New Roman',serif" font-size="118">Your VTOP, now</text>
<text x="92" y="438" fill="#1b1a16" font-family="Georgia,'Times New Roman',serif" font-size="118">in <tspan fill="#bf3d24" font-style="italic">ChatGPT</tspan>.</text>
<text x="96" y="540" fill="#54524a" font-family="Georgia,serif" font-size="34">Attendance · Marks · Timetable · Exams · CGPA</text>
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
