import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { VtopClient } from "./services/vtop-client.js";
import type { Credentials } from "./types/index.js";
import {
  decryptCredentials,
  encryptCredentials,
  isMultiUserEnabled,
} from "./services/crypto.js";
import {
  landingPage,
  resultPage,
  unavailablePage,
  ogImageSvg,
  robotsTxt,
  sitemapXml,
} from "./web.js";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";

// One transport per active MCP session. Each session gets its own MCP server
// instance, but the underlying VtopClient is shared per user (see below).
const transports: Record<string, StreamableHTTPServerTransport> = {};

// PER-USER ISOLATION. Each connector token gets its OWN VtopClient — its own
// cookie jar, login state, and caches (attendance/grades/timetable/calendar all
// live as private fields on that instance, never module-level). So no user's
// cached data can ever reach another user; parallel users are fully independent.
// Keyed by token (not by MCP session) on purpose: ChatGPT's connector may open a
// fresh MCP session per tool call, so get_captcha and login can land on different
// sessions — login must reuse the exact VtopClient get_captcha armed, else VTOP
// 404s. Single-user mode (env creds, no token) has just one shared client.
//
// Bounded by both idle TTL and a hard max (LRU) so memory stays in check under
// many users — Node is single-threaded, so Map access here is race-free.
const SINGLE_USER_KEY = "__single_user__";
const CLIENT_TTL_MS = 30 * 60 * 1000; // evict idle clients after 30 min
const MAX_CLIENTS = 500; // hard cap; evict least-recently-used beyond this
const clientsByUser = new Map<string, { client: VtopClient; lastUsed: number }>();

function getSharedClient(key: string): VtopClient {
  const now = Date.now();
  // Idle eviction.
  for (const [k, entry] of clientsByUser) {
    if (now - entry.lastUsed > CLIENT_TTL_MS) clientsByUser.delete(k);
  }
  const existing = clientsByUser.get(key);
  if (existing) {
    existing.lastUsed = now;
    // Move to most-recently-used end (Map keeps insertion order → O(1) LRU).
    clientsByUser.delete(key);
    clientsByUser.set(key, existing);
    return existing.client;
  }
  // Hard cap: drop the least-recently-used (the first entry) before inserting.
  if (clientsByUser.size >= MAX_CLIENTS) {
    const lru = clientsByUser.keys().next().value;
    if (lru !== undefined) clientsByUser.delete(lru);
  }
  const client = new VtopClient();
  clientsByUser.set(key, { client, lastUsed: now });
  return client;
}

const app = express();
// Render (and most PaaS) terminate TLS at a proxy; trust it so req.protocol is
// "https" and req.get("host") is the public hostname when we build connector URLs.
app.set("trust proxy", true);
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

function originOf(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

app.get("/", (req, res) => {
  // In multi-user mode the root is the landing/registration experience; in
  // single-user mode it stays a small JSON info endpoint. Both return 200 so
  // Render's health check (healthCheckPath: /) passes either way.
  if (isMultiUserEnabled()) {
    res.type("html").send(landingPage(originOf(req), "/"));
    return;
  }
  res.json({
    name: "vtop-mcp",
    transport: "streamable-http",
    endpoint: MCP_PATH,
    multiUser: false,
  });
});

app.get("/og.svg", (_req, res) => {
  res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(ogImageSvg());
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(robotsTxt(originOf(req)));
});

app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").send(sitemapXml(originOf(req)));
});

function extractToken(req: Request): string | undefined {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  // URL-path token: lets ChatGPT use a per-user connector URL with "No Auth",
  // since its connector UI offers no API-key / header field.
  const pathToken = req.params?.token;
  if (typeof pathToken === "string" && pathToken.trim()) {
    return pathToken.trim();
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

async function handleMcpPost(req: Request, res: Response) {
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

    // Reuse this user's VtopClient across MCP sessions so the prelogin session
    // armed by get_captcha is the same one login submits to. Keyed by token in
    // multi-user mode (per-user isolation) or a single key otherwise.
    const client = getSharedClient(extractToken(req) ?? SINGLE_USER_KEY);

    // Bind the authenticated user's credentials to this session's server.
    const { server } = createServer(auth.credentials, client);
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
}

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

// Each method is mounted twice: the bare path (header / single-user clients)
// and a token-in-path variant (`/mcp/<token>`) for ChatGPT's "No Auth" mode.
app.post(MCP_PATH, handleMcpPost);
app.post(`${MCP_PATH}/:token`, handleMcpPost);
app.get(MCP_PATH, handleSessionRequest);
app.get(`${MCP_PATH}/:token`, handleSessionRequest);
app.delete(MCP_PATH, handleSessionRequest);
app.delete(`${MCP_PATH}/:token`, handleSessionRequest);

// --- Self-service registration (multi-user mode) ---------------------------
// Each user submits their own VTOP credentials here and receives a personal
// connector link with their credentials encrypted into the URL. Nothing is
// stored on the server.

app.get("/register", (req: Request, res: Response) => {
  if (!isMultiUserEnabled()) {
    res
      .status(503)
      .type("html")
      .send(
        unavailablePage(
          originOf(req),
          "This server is running in single-user mode. Set a CONNECTOR_SECRET environment variable to enable per-user connector links.",
        ),
      );
    return;
  }
  res.type("html").send(landingPage(originOf(req), "/"));
});

app.post("/register", (req: Request, res: Response) => {
  if (!isMultiUserEnabled()) {
    res
      .status(503)
      .type("html")
      .send(unavailablePage(originOf(req), "Set CONNECTOR_SECRET to enable registration."));
    return;
  }
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!username || !password) {
    res
      .status(400)
      .type("html")
      .send(unavailablePage(originOf(req), "Both username and password are required. Go back and try again."));
    return;
  }
  const token = encryptCredentials({ username, password });
  const origin = originOf(req);
  res
    .set("Cache-Control", "no-store")
    .type("html")
    .send(
      resultPage({
        origin,
        connectorUrl: `${origin}${MCP_PATH}/${token}`,
        baseMcpUrl: `${origin}${MCP_PATH}`,
        token,
      }),
    );
});

app.listen(PORT, () => {
  console.error(`VtopMCP HTTP server listening on :${PORT}${MCP_PATH}`);
  if (isMultiUserEnabled()) {
    console.error(`Multi-user mode ON — users register at :${PORT}/register`);
  }
});
