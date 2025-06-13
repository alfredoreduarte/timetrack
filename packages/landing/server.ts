import fs from "fs";
import path from "path";
import express from "express";
import compression from "compression";
import serveStatic from "serve-static";
import { createServer as createViteServer } from "vite";

async function start() {
  const isProd = process.env.NODE_ENV === "production";
  const root = path.dirname(new URL(import.meta.url).pathname);

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
    // Skip SSR for static assets (includes dots or vite client path)
    if (url.includes(".") || url.startsWith("/@")) {
      return next();
    }
    try {
      let template: string;
      let render: () => Promise<string> | string;

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

      const appHtml = await render();
      console.log("SSR html generated length:", appHtml.length);
      const html = template.replace(`<!--app-html-->`, appHtml);

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
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

  const port = Number(process.env.PORT ?? 8080);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`SSR server running at http://localhost:${port}`);
  });
}

start();
