import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedDatabase } from "./electron-seed";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET || "electron-local-desktop-secret-changeme";
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

const staticDir = process.env.ELECTRON_FRONTEND_STATIC;
if (staticDir) {
  app.use(express.static(staticDir));
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  type MaybeCode = { code?: string; cause?: { code?: string } };
  const e = err as MaybeCode;
  const msg = err instanceof Error ? err.message : String(err);
  const isUnique =
    (e.code ?? "") === "23505" ||
    msg.toLowerCase().includes("unique") ||
    msg.toLowerCase().includes("duplicate");

  if (isUnique) {
    res.status(409).json({ error: "A record with that value already exists" });
    return;
  }

  logger.error(err, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

seedDatabase().catch((err) => logger.error(err, "Failed to seed database"));

export default app;
