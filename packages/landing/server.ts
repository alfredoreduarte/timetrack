import fs from "fs";
import path from "path";
import express from "express";
import compression from "compression";
import serveStatic from "serve-static";
import { createServer as createViteServer } from "vite";

async function start() {
  const isProd = process.env.NODE_ENV === "production";
  const fileDir = path.dirname(new URL(import.meta.url).pathname);
  // In production the compiled file lives in /dist/server, so go two levels up to project root.
  const root =
    process.env.NODE_ENV === "production"
      ? path.resolve(fileDir, "../..")
      : process.cwd();

  const app = express();

  let vite: Awaited<ReturnType<typeof createViteServer>> | undefined;

  if (!isProd) {
    vite = await createViteServer({
      root,
      appType: "custom",
      server: {
        middlewareMode: true,
      },
    });
  } else {
    app.use(compression());
    // The raw template has no page in it: send the real home page instead.
    app.get("/index.html", (_req, res) => res.redirect(301, "/"));
    app.use(
      serveStatic(path.resolve(root, "dist/client"), {
        index: false,
      })
    );
  }

  // -------------------------------------------------------------------
  // 1. Our custom SSR handler (must run before Vite's middleware in dev)
  // -------------------------------------------------------------------
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const [pathname, ...rest] = url.split("?");
    const query = rest.length ? `?${rest.join("?")}` : "";
    // Skip SSR for static assets (a file extension in the path, not the
    // query: links like ?utm_source=news.example still render) and Vite's
    // own paths.
    if (path.extname(pathname) || pathname.startsWith("/@")) {
      return next();
    }
    // One URL per page: /terms/ → /terms.
    if (pathname.length > 1 && pathname.endsWith("/")) {
      let canonical = pathname;
      while (canonical.length > 1 && canonical.endsWith("/")) canonical = canonical.slice(0, -1);
      return res.redirect(301, `${canonical}${query}`);
    }
    try {
      let template: string;
      let render: (url: string) => { html: string; head: string; status: number };

      if (!isProd && vite) {
        template = fs.readFileSync(path.resolve(root, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        render = (await vite.ssrLoadModule("/src/entry-server.tsx")).render;
      } else {
        template = fs.readFileSync(
          path.resolve(root, "dist/client/index.html"),
          "utf-8"
        );
        // The built server bundle will be generated at runtime; ignore TS resolution here
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        render = (await import("./dist/server/entry-server.js")).render;
      }

      const page = render(url);
      // Replacer functions, so "$&" or "$$" in page text stays literal.
      const html = template.replace(`<!--app-head-->`, () => page.head).replace(`<!--app-html-->`, () => page.html);

      res.status(page.status).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      if (!isProd && vite) {
        vite.ssrFixStacktrace(err as Error);
      }
      console.error(err);
      res.status(500).end((err as Error).message);
    }
  });

  // In dev, let Vite handle asset requests AFTER our SSR handler
  if (!isProd && vite) {
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT ?? 5174);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`SSR server running at http://localhost:${port}`);
  });
}

start();
