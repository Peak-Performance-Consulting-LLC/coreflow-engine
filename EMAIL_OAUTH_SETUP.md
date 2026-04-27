# Email OAuth Setup (Google Workspace + Microsoft 365)

This project already supports both OAuth providers in:

- `supabase/functions/email-oauth-start`
- `supabase/functions/email-oauth-callback`
- `supabase/functions/_shared/email-sender-adapters.ts`

If you see:

- `GOOGLE_OAUTH_CLIENT_ID is required.`
- `MICROSOFT_OAUTH_CLIENT_ID is required.`

it means required Supabase function secrets are not set.

## 1. Prepare environment values

Copy function env template:

```bash
cp supabase/.env.example supabase/.env
```

Generate encryption key:

```bash
openssl rand -base64 32
```

Use that output for `EMAIL_CREDENTIALS_ENCRYPTION_KEY`.

## 2. Google Workspace OAuth app

1. Open Google Cloud Console.
2. Create/select a project.
3. Configure OAuth consent screen.
4. Create OAuth client: `Web application`.
5. Add Authorized redirect URI:
   - `https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-oauth-callback`
6. Note `Client ID` and `Client Secret`.
7. Ensure scopes requested by this app are allowed:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.send`

## 3. Microsoft 365 OAuth app

1. Open Microsoft Entra admin center (Azure portal).
2. Go to `App registrations` -> `New registration`.
3. Add Redirect URI (Web):
   - `https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-oauth-callback`
4. Create a client secret and copy it.
5. In `API permissions`, add delegated permissions:
   - `openid`
   - `profile`
   - `email`
   - `offline_access`
   - `User.Read`
   - `Mail.Send`
6. Note `Application (client) ID` as `MICROSOFT_OAUTH_CLIENT_ID`.

## 4. Set Supabase function secrets

Replace placeholders and run:

```bash
supabase secrets set \
  APP_URL="http://localhost:5173" \
  FRONTEND_URL="http://localhost:5173" \
  GOOGLE_OAUTH_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID" \
  GOOGLE_OAUTH_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET" \
  MICROSOFT_OAUTH_CLIENT_ID="YOUR_MS_CLIENT_ID" \
  MICROSOFT_OAUTH_CLIENT_SECRET="YOUR_MS_CLIENT_SECRET" \
  EMAIL_CREDENTIALS_ENCRYPTION_KEY="YOUR_32_BYTE_KEY" \
  --project-ref YOUR_PROJECT_REF
```

If you need custom callback URL, also set:

```bash
supabase secrets set \
  EMAIL_OAUTH_CALLBACK_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-oauth-callback" \
  --project-ref YOUR_PROJECT_REF
```

## 5. Deploy/refresh functions

```bash
supabase functions deploy email-oauth-start --project-ref YOUR_PROJECT_REF
supabase functions deploy email-oauth-callback --project-ref YOUR_PROJECT_REF
supabase functions deploy account-settings-get --project-ref YOUR_PROJECT_REF
```

## 6. Verify in app

1. Open `/email`.
2. Click `Connect` for Google Workspace or Microsoft 365.
3. Complete provider consent.
4. Confirm sender appears as `connected` in Email Configuration.

## Troubleshooting

- `Edge Function returned a non-2xx status code`:
  - Check secrets are set in the same Supabase project your frontend points to.
- Redirect mismatch from provider:
  - Verify redirect URI is exactly `https://YOUR_PROJECT_REF.supabase.co/functions/v1/email-oauth-callback`.
- Token refresh failures later:
  - Reconnect sender (refresh token may be missing/revoked).
