import { NextFunction, Request, Response } from 'express';

export interface AuthenticatedRequest extends Request { user: Express.User & { id: string }; }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

export function getUserId(req: Request) { return (req.user as { id: string }).id; }