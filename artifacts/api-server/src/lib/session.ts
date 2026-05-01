import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgSession = connectPgSimple(session);

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error(
    "FATAL: SESSION_SECRET environment variable is not set. " +
      "Set it to a long random string before starting the server.",
  );
  process.exit(1);
}

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "sessions",
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
  },
});
