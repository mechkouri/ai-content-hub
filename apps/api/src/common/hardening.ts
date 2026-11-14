import { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Headers that tell browsers not to guess, embed or leak. This is an API: it never needs to be framed. */
export function securityHeaders(production: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (production) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

export interface RateLimitOptions {
  /** Requests allowed per client in one window. */
  limit: number;
  windowMs?: number;
  /** Paths that are never limited, for example the health check used by a load balancer. */
  skip?: (req: Request) => boolean;
  now?: () => number;
}

/**
 * A fixed-window limit per client address, kept in memory. It stops one address from hammering the API
 * (password guessing, scraping, a runaway script). It is not a substitute for a gateway in front of several
 * servers: each server counts on its own. Answers 429 with Retry-After.
 */
export function rateLimit(opts: RateLimitOptions) {
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const hits = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = now();

  return (req: Request, res: Response, next: NextFunction) => {
    if (opts.skip?.(req) || req.method === 'OPTIONS') return next();
    const t = now();
    // Forget windows that ended, so the table cannot grow without bound.
    if (t - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      lastSweep = t;
    }
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, opts.limit - entry.count);
    res.setHeader('RateLimit-Limit', String(opts.limit));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((entry.resetAt - t) / 1000)));
    if (entry.count > opts.limit) {
      const wait = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
      res.setHeader('Retry-After', String(wait));
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests. Please wait a moment.',
        retryAfterSeconds: wait,
      });
      return;
    }
    next();
  };
}

export interface HardeningOptions {
  production: boolean;
  ratePerMinute: number;
  /** The API sits behind a reverse proxy, so the real client address is in X-Forwarded-For. */
  trustProxy: boolean;
}

/** Everything that protects the API without being part of any feature. Shared by the server and the tests. */
export function applyHardening(app: INestApplication, o: HardeningOptions) {
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  // Only trust forwarded addresses when a proxy we control is in front: otherwise anyone could fake theirs.
  if (o.trustProxy) express.set('trust proxy', 1);
  app.use(securityHeaders(o.production));
  if (o.ratePerMinute > 0) {
    app.use(
      rateLimit({
        limit: o.ratePerMinute,
        skip: (req) => req.path === '/api/health' || req.path.startsWith('/api/health/'),
      }),
    );
  }
}
