import crypto from "crypto";

export const API_KEY_PREFIX = "tt_";
const RANDOM_BYTES = 24; // 48 hex chars after the prefix
const STORED_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  token: string;
  hash: string;
  prefix: string;
}

export const generateApiKey = (): GeneratedApiKey => {
  const random = crypto.randomBytes(RANDOM_BYTES).toString("hex");
  const token = `${API_KEY_PREFIX}${random}`;
  return {
    token,
    hash: hashApiKey(token),
    prefix: token.slice(0, STORED_PREFIX_LENGTH),
  };
};

export const hashApiKey = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const isApiKeyToken = (token: string): boolean =>
  token.startsWith(API_KEY_PREFIX);
