import rateLimit from "express-rate-limit";

const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  // Local Bun/Express often has no reverse proxy; skip strict forwarded-for checks.
  validate: { xForwardedForHeader: false },
} as const;

export const globalRateLimit = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    message: "Too many requests. Please try again later.",
    code: "RATE_LIMITED",
  },
});

export const authRateLimit = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    message: "Too many authentication requests. Please try again later.",
    code: "RATE_LIMITED",
  },
});
