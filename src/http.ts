import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import type { Credentials } from "./types/index.js";
import {
  decryptCredentials,
  encryptCredentials,
  isMultiUserEnabled,
} from "./services/crypto.js";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";

// One transport per active MCP session. Each session also gets its own
// MCP server instance (and therefore its own VtopClient + cookie jar), so
// concurrent users never share login state on this remote endpoint.
const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));

// CORS so the browser-based MCP Inspector can reach the server. ChatGPT
// itself connects server-side and does not need this.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version, authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/", (_req, res) => {
  res.json({
    name: "vtop-mcp",
    transport: "streamable-http",
    endpoint: MCP_PATH,
    multiUser: isMultiUserEnabled(),
    register: isMultiUserEnabled() ? "/register" : undefined,
  });
});

function extractToken(req: Request): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  const x = req.headers["x-vtop-token"];
  if (typeof x === "string" && x.trim()) return x.trim();
  return undefined;
}

function send401(res: Response, message: string) {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message },
    id: null,
  });
}

/**
 * Resolve the VTOP credentials for a request.
 *  - A valid connector token (multi-user mode) yields that user's credentials.
 *  - No token is allowed only when the server isn't enforcing multi-user, i.e.
 *    single-user env-var credentials or the legacy in-chat login flow.
 * Returns null after sending a 401 when authentication is required but absent.
 */
function authenticate(
  req: Request,
  res: Response,
): { credentials?: Credentials } | null {
  const token = extractToken(req);
  if (token) {
    try {
      return { credentials: decryptCredentials(token) };
    } catch {
      send401(res, "Invalid connector token. Re-register at /register to get a new one.");
      return null;
    }
  }
  const hasEnvCreds = !!(process.env.VTOP_USERNAME && process.env.VTOP_PASSWORD);
  if (isMultiUserEnabled() && !hasEnvCreds) {
    send401(res, "Authentication required. Visit /register to create your personal connector token.");
    return null;
  }
  return {};
}

app.post(MCP_PATH, async (req: Request, res: Response) => {
  const auth = authenticate(req, res);
  if (!auth) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    // Bind the authenticated user's credentials to this session's server.
    const { server } = createServer(auth.credentials);
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID provided" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET = server-to-client SSE stream; DELETE = explicit session teardown.
async function handleSessionRequest(req: Request, res: Response) {
  if (!authenticate(req, res)) return;
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}

app.get(MCP_PATH, handleSessionRequest);
app.delete(MCP_PATH, handleSessionRequest);

// --- Self-service registration (multi-user mode) ---------------------------
// Each user submits their own VTOP credentials here and receives an opaque
// token to paste into their ChatGPT connector's API-key / Authorization field.
// The token is encrypted ciphertext; nothing is stored on the server.

function registerPage(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VTOP connector — get your token</title>
<style>
body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;line-height:1.5}
input{width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box;font-size:16px}
button{padding:10px 18px;font-size:16px;cursor:pointer}
code,pre{background:#f4f4f4;padding:8px;border-radius:6px;display:block;word-break:break-all;white-space:pre-wrap}
.warn{color:#a40000}
</style></head><body>${body}</body></html>`;
}

app.get("/register", (_req: Request, res: Response) => {
  if (!isMultiUserEnabled()) {
    res
      .status(503)
      .type("html")
      .send(
        registerPage(
          `<h1>Registration unavailable</h1><p>This server is running in single-user mode. Set a <code>CONNECTOR_SECRET</code> environment variable to enable per-user tokens.</p>`,
        ),
      );
    return;
  }
  res
    .type("html")
    .send(
      registerPage(
        `<h1>Get your VTOP connector token</h1>
<p>Enter your VTOP credentials to generate a personal token. Paste that token into your ChatGPT connector as the API key / Authorization value. Your credentials are encrypted into the token and are <strong>not stored</strong> on this server.</p>
<form method="POST" action="/register">
<label>VTOP username / registration number<input name="username" autocomplete="off" required></label>
<label>VTOP password<input name="password" type="password" autocomplete="off" required></label>
<button type="submit">Generate token</button>
</form>
<p class="warn">Only use this on a deployment you trust — the server operator can technically decrypt tokens.</p>`,
      ),
    );
});

app.post("/register", (req: Request, res: Response) => {
  if (!isMultiUserEnabled()) {
    res.status(503).type("html").send(
      registerPage(`<h1>Registration unavailable</h1><p>Set <code>CONNECTOR_SECRET</code> to enable this.</p>`),
    );
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    res.status(400).type("html").send(
      registerPage(`<h1>Missing fields</h1><p>Both username and password are required. <a href="/register">Try again</a>.</p>`),
    );
    return;
  }
  const token = encryptCredentials({ username, password });
  res.type("html").send(
    registerPage(
      `<h1>Your connector token</h1>
<p>Copy this and paste it into your ChatGPT custom connector's API key / Authorization field (it is sent as <code>Authorization: Bearer &lt;token&gt;</code>):</p>
<pre>${token}</pre>
<p>Keep it private — anyone with this token can read your VTOP data. To revoke it, ask the operator to rotate <code>CONNECTOR_SECRET</code> (this invalidates all tokens). <a href="/register">Generate another</a>.</p>`,
    ),
  );
});

app.listen(PORT, () => {
  console.error(`VtopMCP HTTP server listening on :${PORT}${MCP_PATH}`);
  if (isMultiUserEnabled()) {
    console.error(`Multi-user mode ON — users register at :${PORT}/register`);
  }
});
