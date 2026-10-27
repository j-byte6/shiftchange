# ShiftChange

A phone-friendly web app for The Vancouver Club's staff to give away and swap shifts.

- Staff post a shift they can't work, either for everyone or for teammates they pick.
- Teammates pick it up, or offer one of their own shifts in exchange.
- A manager approves the change. Approval can be switched off, but taking a shift outside your own role always needs a manager.
- Managers invite staff by email and remove them when they leave. Each person has their own login.

Built with Next.js and Postgres. Emails go through [Resend](https://resend.com) when it's set up.

## Settings

Copy `.env.example` to `.env.local` and fill it in. On Vercel, add the same values under Project Settings, then Environment Variables.

| Name | What it's for |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Vercel fills this in when you add a Neon database. |
| `SETUP_CODE` | A phrase you choose. It's needed once, at `/setup`, to create the first manager. |
| `APP_URL` | The site's address, used in emailed links. On Vercel it defaults to the project's main address. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Without them, managers get invite and reset links to send themselves. |
| `DEMO_MODE` | Set to `1` for a demo copy. The first build fills an empty database with sample people, the sign-in page lists them, and no email is sent. |
| `DEMO_PASSWORD` | Optional. The password the sample people use in demo mode. |

## Running it locally

```sh
npm install
npm run migrate      # creates the tables
npm run dev          # http://localhost:3000
```

Open the site and follow `/setup` to create the first manager, or load sample data with
`node scripts/seed-demo.mjs --reset` and set `DEMO_MODE=1`.

## Roles

The roles and sections (front of house, back of house, bar, manager) are listed in `lib/roles.ts`.
