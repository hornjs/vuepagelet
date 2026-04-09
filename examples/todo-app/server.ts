import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import { createRouteRuntimeIntegration } from "vuepagelet/integration";
import { app, routes } from "./routes.ts";

const port = Number(process.env.PORT || 3210);
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = resolve(currentDir, "../..");
const vite = await createViteServer({
  root: packageRoot,
  appType: "custom",
  resolve: {
    alias: [
      {
        find: /^vue$/,
        replacement: "vue/dist/vue.esm-browser.js",
      },
    ],
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  optimizeDeps: {
    exclude: ["vue"],
  },
  server: {
    middlewareMode: true,
  },
});
const runtime = createRouteRuntimeIntegration({
  routes,
  app,
  clientEntryPath: "/examples/todo-app/client.ts",
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);

    if (url.pathname === "/favicon.ico") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (shouldServeWithVite(url.pathname)) {
      return vite.middlewares(req, res, (error: unknown) => {
        if (error) {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.stack || error.message : String(error));
        }
      });
    }

    const request = toWebRequest(req, res, url);
    const response = await runtime.handleRequest(request);
    await sendWebResponse(res, response);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(message);
      return;
    }

    res.destroy(error instanceof Error ? error : new Error(message));
  }
});

server.listen(port, () => {
  console.log(`vuepagelet example listening on http://localhost:${port}`);
  console.log("Try:");
  console.log(`  open http://localhost:${port}/`);
  console.log(`  curl -N http://localhost:${port}/`);
});

function toWebRequest(req: IncomingMessage, res: ServerResponse, url: URL): Request {
  const method = req.method || "GET";
  const controller = new AbortController();

  const abort = () => {
    controller.abort();
  };

  req.once("aborted", abort);
  res.once("close", () => {
    if (!res.writableEnded) {
      abort();
    }
  });

  if (method === "GET" || method === "HEAD") {
    return new Request(url, {
      method,
      headers: toHeadersInit(req.headers),
      signal: controller.signal,
    });
  }

  return new Request(url, {
    method,
    headers: toHeadersInit(req.headers),
    body: Readable.toWeb(req) as unknown as BodyInit,
    signal: controller.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") {
      return;
    }
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), res);
}

function shouldServeWithVite(pathname: string): boolean {
  return (
    pathname.startsWith("/src/") ||
    pathname.startsWith("/examples/") ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/node_modules/") ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

function toHeadersInit(headers: IncomingMessage["headers"]): HeadersInit {
  const normalized: [string, string][] = [];

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      normalized.push([key, value.join(", ")]);
      continue;
    }

    if (typeof value === "string") {
      normalized.push([key, value]);
    }
  }

  return normalized;
}
