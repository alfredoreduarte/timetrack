import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

export function encrypt(text: string): string {
  const key = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY not configured");

  const keyBuffer = Buffer.from(key, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY not configured");

  const keyBuffer = Buffer.from(key, "hex");
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
