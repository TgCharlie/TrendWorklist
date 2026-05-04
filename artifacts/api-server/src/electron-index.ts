import app from "./electron-app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

app.listen(port, "127.0.0.1", () => {
  logger.info({ port }, "Server listening");
  process.stdout.write(`READY:${port}\n`);
});
