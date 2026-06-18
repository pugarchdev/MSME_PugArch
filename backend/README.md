# Backend Setup Notes

## MeriPehchaan / API Setu Aadhaar KYC

The Aadhaar KYC flow uses API Setu / MeriPehchaan Auth Partner with OAuth 2.0 + OpenID Connect. The portal must never store Aadhaar numbers, OTPs, provider tokens, client secrets, or raw provider responses.

### Required environment variables

Set these only in `backend/.env` for local development or in the production secret manager. Do not commit real values.

```env
MERIPEHCHAAN_CLIENT_ID=
MERIPEHCHAAN_CLIENT_SECRET=
MERIPEHCHAAN_AUTH_URL=
MERIPEHCHAAN_TOKEN_URL=
MERIPEHCHAAN_USERINFO_URL=
MERIPEHCHAAN_JWKS_URL=
MERIPEHCHAAN_ISSUER=
MERIPEHCHAAN_REDIRECT_URI=https://jsgsmile.in/api/kyc/aadhaar/callback
MERIPEHCHAAN_SCOPES=openid profile email
MERIPEHCHAAN_ACR=
FRONTEND_URL=https://jsgsmile.in
AADHAAR_KYC_SESSION_TTL_MINUTES=10
```

Use the exact authorization, token, userinfo, JWKS, and issuer values from the API Setu Auth Partner documentation or dashboard. Do not guess endpoint URLs.

### API Setu Auth Partner configuration

- Website/App Domain: `https://jsgsmile.in/`
- App Name: `JSGSmile MSME Portal`
- Callback URL: `https://jsgsmile.in/api/kyc/aadhaar/callback`
- Scopes: request only approved scopes for `openid`, profile name/date of birth/gender, age verification, email if approved, and address only if approved and required.

Rotate the API Setu client secret before enabling production traffic if it was exposed anywhere outside the secret manager.

### Security behavior

- `/api/kyc/aadhaar/start` requires an authenticated user and creates a short-lived state + PKCE S256 session.
- `/api/kyc/aadhaar/callback` validates state, expiry, replay protection, and exact redirect URI before exchanging the code server-side.
- The token exchange is backend-only.
- Signed OIDC ID tokens are verified against `MERIPEHCHAAN_JWKS_URL`, expected audience, optional issuer, and an asymmetric algorithm allowlist before claims are used.
- Stored KYC data is limited to verification status, safe verified profile fields, reference key/subject, timestamps, and audit events.
- Callback logs must not include full query strings because they may contain authorization codes.
- Production must use HTTPS callback URLs.

### Verification checklist

```powershell
npm exec --workspace=backend -- prisma validate
npm run typecheck --workspace=backend
npm run build --workspace=backend
npm run typecheck --workspace=frontend
npm run build --workspace=frontend
```

Functional checks:

- Unauthenticated `GET /api/kyc/aadhaar/start` returns `401`.
- Authenticated start creates `KycAuthSession`, `UserKycVerification=PENDING`, and redirects to MeriPehchaan.
- Invalid or expired callback state redirects safely with `aadhaar=expired`.
- Successful callback marks the user verification `VERIFIED`.
- Replaying the same state fails because the session is marked used.
- Admin review shows only status, verified name, verified at, provider, reference key/subject. It must never show Aadhaar number or token data.
