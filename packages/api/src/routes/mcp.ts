import express from "express";
import rateLimit from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { contextFromRequest } from "../services/context";
import { buildMcpServer } from "../mcp/server";
import { logger } from "../utils/logger";

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Each POST builds a fresh
 * server bound to the caller, so there is no session state to leak between
 * users. Auth: `Authorization: Bearer tt_…` (API key) or a JWT.
 *
 *   claude mcp add --transport http timetrack https://api.example.com/mcp \
 *     --header "Authorization: Bearer tt_…"
 */
const router = express.Router();

const jsonRpcError = (res: express.Response, status: number, message: string) =>
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });

router.use((req, res, next) => {
  // Tell MCP clients how to authenticate when they arrive without a token.
  res.setHeader("WWW-Authenticate", 'Bearer realm="TimeTrack"');
  next();
});
router.use(authenticate);
router.use(
  rateLimit({
    windowMs: 60_000,
    max: Number(process.env.MCP_REQUESTS_PER_MINUTE || 600),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip ?? "anon",
    handler: (_req, res) => {
      jsonRpcError(res, 429, "Too many MCP requests, slow down.");
    },
  })
);

router.post("/", async (req: AuthenticatedRequest, res) => {
  const ctx = contextFromRequest(req);
  // Requests without an explicit client label are MCP traffic.
  if (!req.headers["x-client"]) ctx.via = "mcp";

  const server = buildMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    logger.error("MCP request failed", { error: e instanceof Error ? e.message : String(e) });
    if (!res.headersSent) jsonRpcError(res, 500, "Internal server error");
  }
});

// Stateless server: no server-initiated streams and no sessions to delete.
router.get("/", (_req, res) => jsonRpcError(res, 405, "Method not allowed"));
router.delete("/", (_req, res) => jsonRpcError(res, 405, "Method not allowed"));

export default router;
