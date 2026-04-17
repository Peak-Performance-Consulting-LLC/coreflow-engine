# CoreFlow

CoreFlow is a dark-first, premium CRM starter built around one shared platform with industry-specific onboarding modes. This first version focuses on landing, auth, workspace creation, CRM selection, and dashboard entry.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Framer Motion
- Lucide React
- Supabase Auth
- Supabase Postgres
- Supabase Edge Functions
- SQL migrations

## What is included

- Attractive homepage with animated hero, features, industry modes, trust UI, and CTA sections
- Beautiful sign-in and sign-up flows
- Workspace creation during signup
- CRM mode selection during signup
- Protected dashboard routing
- Dashboard shell personalized by CRM type
- Supabase SQL migration for profiles, workspaces, memberships, indexes, triggers, and RLS
- `complete-signup` edge function
- `get-user-workspace` edge function

## Project structure

```text
.
|-- public/
|-- src/
|   |-- components/
|   |   |-- auth/
|   |   |-- dashboard/
|   |   |-- home/
|   |   `-- ui/
|   |-- context/
|   |-- hooks/
|   |-- lib/
|   |-- pages/
|   `-- routes/
|-- supabase/
|   |-- functions/
|   |   |-- _shared/
|   |   |-- complete-signup/
|   |   `-- get-user-workspace/
|   `-- migrations/
|-- .env.example
`-- README.md
```

## Frontend setup

1. Install dependencies:

```bash
npm install
```

2. Copy the env template and add your Supabase values:

```bash
cp .env.example .env
```

3. Start the app:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Supabase setup

1. Create a Supabase project.
2. For the smoothest MVP signup flow, disable email confirmation in Auth or be prepared to confirm the user email before finishing onboarding.
3. Run the SQL migration in `supabase/migrations/202603300001_coreflow_auth_workspace_setup.sql`.
4. Deploy the edge functions:

```bash
supabase functions deploy complete-signup
supabase functions deploy get-user-workspace
```

5. Make sure the deployed functions have access to the standard Supabase function env vars:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Auth, workspace creation, and CRM routing

### Signup flow

1. The user submits full name, email, password, workspace name, slug, and CRM mode.
2. The frontend creates the auth user with Supabase Auth.
3. If a session is available, the frontend invokes `complete-signup`.
4. `complete-signup` validates the payload, upserts the profile, creates the workspace, and inserts the owner membership row.
5. The frontend refreshes workspace state and redirects to `/dashboard/:crmType`.

### Signin flow

1. The user signs in with `signInWithPassword`.
2. The frontend invokes `get-user-workspace`.
3. If a workspace is found, the user is redirected into the matching dashboard route.
4. If no workspace exists yet, the user is routed to `/onboarding/complete`.

### Dashboard protection

- Unauthenticated users are redirected to `/signin`.
- Authenticated users without a workspace are redirected to `/onboarding/complete`.
- Authenticated users with a workspace can access `/dashboard` and `/dashboard/:crmType`.

## Database model

### `profiles`

- `id` references `auth.users(id)`
- `full_name`
- timestamps

### `workspaces`

- `id`
- `name`
- `slug`
- `crm_type`
- `owner_id`
- timestamps

### `workspace_members`

- `id`
- `workspace_id`
- `user_id`
- `role`
- timestamps
- unique membership per workspace/user

## RLS starter policies

- Users can read, insert, and update only their own profile row.
- Workspace members can read their workspace.
- Workspace owners/admins can update workspace rows.
- Users can read their own membership rows, and owners/admins can read related membership rows.
- Authenticated onboarding inserts are limited to owner-linked workspace creation patterns.

## Notes

- The dashboard is intentionally a UI shell only. It is personalized by CRM mode, but it does not include real CRM business logic yet.
- `Forgot password` is currently a UI link with a toast placeholder.
- If Supabase env vars are missing, the landing page still renders and auth pages show a configuration notice.
