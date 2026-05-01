import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const PgSession = connectPgSimple(session);

const SESSION_SECRET = process.env.SESSION_SECRET ?? "cnc-worklist-secret-change-in-prod";

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
