import { Buffer } from "buffer";
// Set Buffer globally for libraries that expect Node.js Buffer (e.g., gray-matter)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!(window as any).Buffer) {
  // @ts-ignore
  (window as any).Buffer = Buffer;
}
