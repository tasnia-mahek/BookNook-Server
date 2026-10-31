import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.includes('replace-with') || value.includes('<')) throw new Error(`${name} is required and must not be a placeholder.`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 5000),
  mongoUri: required('MONGODB_URI'),
  mongoDb: process.env.MONGODB_DB ?? 'booknook',
  clientOrigins: Array.from(new Set([
    ...(process.env.CLIENT_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean),
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter((origin): origin is string => Boolean(origin)))),
  authIssuer: required('BETTER_AUTH_ISSUER'),
  authAudience: required('BETTER_AUTH_AUDIENCE'),
  authJwksUrl: required('BETTER_AUTH_JWKS_URL'),
};
