import type { NextFunction, Request, Response } from "express";
import { getAuth } from "../firebase/admin.ts";

export type AuthenticatedRequest = Request & {
  user?: {
    uid: string;
    email?: string;
    name?: string;
  };
};

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const auth = getAuth();

  if (!auth) {
    res.status(503).json({
      message: "Authentication service is not configured.",
      code: "FIREBASE_NOT_CONFIGURED",
    });
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Missing or invalid authorization header.",
      code: "UNAUTHORIZED",
    });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch {
    res.status(401).json({
      message: "Invalid or expired session. Please sign in again.",
      code: "UNAUTHORIZED",
    });
  }
}
