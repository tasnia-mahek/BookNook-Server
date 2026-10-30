import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { Collection, ObjectId } from 'mongodb';
import { config } from '../config.js';
import { User } from '../db.js';

export type AuthRequest = Request & { user?: User };
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks() { return jwks ??= createRemoteJWKSet(new URL(config.authJwksUrl)); }

export function authMiddleware(users: Collection<User>) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required.' });
    try {
      const { payload } = await jwtVerify(header.slice(7), getJwks(), { issuer: config.authIssuer, audience: config.authAudience });
      const subject = String(payload.sub ?? '');
      const user = await users.findOne({
        $or: [
          { id: subject },
          ...(ObjectId.isValid(subject) ? [{ _id: new ObjectId(subject) }] : []),
        ],
      });
      if (!user) return res.status(401).json({ message: 'Authenticated user was not found.' });
      req.user = user;
      next();
    } catch (error) {
      console.error('JWT verification failed:', error instanceof Error ? error.message : error);
      return res.status(401).json({ message: 'Invalid or expired authentication token.' });
    }
  };
}
