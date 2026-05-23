import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";

// One transport per active MCP session. Each session also gets its own
// MCP server instance (and therefore its own VtopClient + cookie jar), so
// concurrent users never share login state on this remote endpoint.
const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
app.use(express.json({ limit: "4mb" }));

// CORS so the browser-based MCP Inspector can reach the server. ChatGPT
// itself connects server-side and does not need this.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, mcp-protocol-version");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/", (_req, res) => {
  res.json({ name: "vtop-mcp", transport: "streamable-http", endpoint: MCP_PATH });
});

app.post(MCP_PATH, async (req: Request, res: Response) => {
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

    const { server } = createServer();
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
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}

app.get(MCP_PATH, handleSessionRequest);
app.delete(MCP_PATH, handleSessionRequest);

app.listen(PORT, () => {
  console.error(`VtopMCP HTTP server listening on :${PORT}${MCP_PATH}`);
});
