import { AuthenticatedRequest } from "../middleware/auth";
import { deriveSource } from "../utils/source";

export type ActorType = "user" | "api_key" | "system";

/**
 * Who is acting and on whose behalf. Services take this instead of an
 * Express request so the same logic serves REST, MCP and background jobs.
 */
export interface ServiceContext {
  userId: string;
  actorType: ActorType;
  /** API key id for api_key actors, user id for users, null for system. */
  actorId: string | null;
  /** Human-readable actor, e.g. the API key's name ("Claude Code"). */
  actorLabel: string | null;
  /** Client label stored as `createdVia` (web, ios, mcp, claude_code, …). */
  via: string;
  /** Default `isAiGenerated` for records this actor creates. */
  aiDefault: boolean;
  now: () => Date;
}

export const contextFromRequest = (
  req: AuthenticatedRequest,
  overrides: Partial<ServiceContext> = {}
): ServiceContext => {
  if (!req.user) throw new Error("contextFromRequest requires an authenticated request");
  const { createdVia, isAiGenerated } = deriveSource(req);
  const isKey = req.authMethod === "api_key";
  return {
    userId: req.user.id,
    actorType: isKey ? "api_key" : "user",
    actorId: isKey ? req.apiKeyId ?? null : req.user.id,
    actorLabel: isKey ? req.apiKeyName ?? null : null,
    via: createdVia,
    aiDefault: isAiGenerated,
    now: () => new Date(),
    ...overrides,
  };
};

/** Context for background jobs acting on a user's data (e.g. idle sweeper). */
export const systemContext = (
  userId: string,
  now: () => Date = () => new Date()
): ServiceContext => ({
  userId,
  actorType: "system",
  actorId: null,
  actorLabel: "TimeTrack",
  via: "system",
  aiDefault: false,
  now,
});
