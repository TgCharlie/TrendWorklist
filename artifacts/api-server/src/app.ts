import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { seedDatabase } from "./lib/seed";

const app: Express = express();
app.disable("etag");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (
        origin.startsWith("http://localhost") ||
        origin.endsWith(".replit.dev") ||
        origin.endsWith(".replit.app")
      ) {
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
app.use(sessionMiddleware);

app.use("/api", router);

// Global error handler — returns JSON instead of HTML
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  type MaybeCode = { code?: string; cause?: { code?: string } };
  const e = err as MaybeCode;
  const pgCode = e.code ?? e.cause?.code ?? "";
  const msg = err instanceof Error ? err.message : String(err);
  const isUnique =
    pgCode === "23505" ||
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
