import { AuthenticatedRequest } from "../middleware/auth";

const ALLOWED_VIA = new Set([
  "web",
  "electron",
  "ios",
  "mac",
  "mcp",
  "api",
]);

const isTruthyHeader = (value: string | string[] | undefined): boolean => {
  if (Array.isArray(value)) value = value[0];
  if (!value) return false;
  return ["1", "true", "yes"].includes(value.toLowerCase());
};

/**
 * Determines how a TimeEntry was created — which client and whether
 * it was AI-driven. Clients may opt out of the AI flag via
 * `X-AI-Generated: false`; the default for API-key auth is true since
 * the dominant use case is agent automation.
 */
export const deriveSource = (
  req: AuthenticatedRequest
): { createdVia: string; isAiGenerated: boolean } => {
  const headerClient = (req.headers["x-client"] as string | undefined)
    ?.toLowerCase()
    .trim();
  const createdVia =
    headerClient && ALLOWED_VIA.has(headerClient)
      ? headerClient
      : req.authMethod === "api_key"
        ? "api"
        : "web";

  const aiHeader = req.headers["x-ai-generated"];
  const apiKeyDefault =
    req.authMethod === "api_key" ? (req.apiKeyAiByDefault ?? true) : false;
  const isAiGenerated =
    aiHeader !== undefined ? isTruthyHeader(aiHeader) : apiKeyDefault;

  return { createdVia, isAiGenerated };
};
