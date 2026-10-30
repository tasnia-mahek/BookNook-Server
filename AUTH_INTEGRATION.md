# Better Auth and Express integration plan

The Next.js client owns authentication through Better Auth and stores users,
accounts, sessions, and JWT signing keys in MongoDB. A Better Auth session
cookie is not an Express JWT and must not be passed to the Express API as if it
were one.

The client configures Better Auth's JWT plugin with:

- issuer: `BETTER_AUTH_URL`
- audience: `booknook-server`
- JWKS endpoint: Better Auth's `/api/auth/jwks`
- session token endpoint: Better Auth's `/api/auth/token`

For the next business-API stage, the client should request a short-lived JWT
from `/api/auth/token`, send it as `Authorization: Bearer <token>` to Express,
and the Express middleware should verify the signature against the JWKS
endpoint using the JWT `issuer` and `audience`. It must not use the existing
`JWT_SECRET` HMAC middleware for Better Auth tokens, because Better Auth's JWT
plugin uses managed signing keys.

The current Express business routes are intentionally not changed in this
authentication stage. Before wiring them to Better Auth, replace the current
custom-token assumption with JWKS-based verification and map the verified
`sub`/user claims to the authenticated user.

## Google OAuth values required

Set these only in local/deployment environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

In Google Cloud Console, configure the OAuth consent screen and add the
Better Auth callback URL:

`http://localhost:3000/api/auth/callback/google`

Add the production callback URL after deployment.
