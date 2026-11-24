# Cup Culture Admin

The café team's admin site for Cup Culture: orders, new counter orders and bill printing, menu availability, reservations, tables, reports, team logins and kitchen stock.

It uses the **same Supabase project** as the public website (`h2ttechnologies/cup-cluture`).

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3001
```

## Environment variables

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (same as the website) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `SUPABASE_SECRET_KEY` | Supabase secret key — server only, never commit |
| `NEXT_PUBLIC_SITE_URL` | The public website, e.g. `https://cupculture.in` |
| `WHATSAPP_*` | Optional, for WhatsApp order updates |

## Database

Kitchen stock needs the migrations in the website repo:
`supabase/migrations/202611230004_kitchen_inventory.sql` (and `…0005_remove_combos.sql`).
Run them once in Supabase → SQL Editor.

## Access

Only accounts with `role = admin` in `profiles` can sign in. Admins add and remove logins under **Team logins**.
The first admin is created on the sign-in page while no admin exists yet.
