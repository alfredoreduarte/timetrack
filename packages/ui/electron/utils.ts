export function isDev(): boolean {
  return process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
}

export function getAssetPath(relativePath: string): string {
  if (isDev()) {
    return require("path").join(__dirname, "../assets", relativePath);
  }
  return require("path").join(__dirname, "../assets", relativePath);
}
