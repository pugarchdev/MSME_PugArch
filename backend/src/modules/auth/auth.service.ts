import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';

export const signAuthToken = (payload: { id: number; role: string }) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as SignOptions);

export const toSafeUser = <T extends { password?: unknown; id: number }>(user: T) => {
  const { password: _password, ...safeUser } = user;
  return { ...safeUser, _id: user.id };
};
