<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Encontre +)

- Never enable Lovable Cloud or any Lovable-managed database: the owner runs Laravel + external Supabase + Railway; the browser only talks to the Laravel API.
- Frontend lives at repo root (Lovable requirement); Laravel goes in `backend/`, WhatsApp service in `whatsapp-bridge/`, docs in `docs/` — keeps responsibilities separated in one repo.
- All HTTP calls go through `src/lib/api/client.ts` with types in `src/lib/api/types.ts`, mirrored in `docs/API_CONTRACT.md` — one contract the Laravel team implements against.
- Money is integer Kwanza (`*_kz`) end to end and formatted with `src/lib/format.ts`; dates render in Africa/Luanda — avoids float errors and timezone drift.
- Financial/subscription state is computed only by the backend; `src/lib/plan-defaults.ts` is display-only fallback copy.
- Modules not yet built render `ModulePlaceholder` (features + API contract) instead of fake data or dead buttons.
- WhatsApp/Bider and payment gateways sit behind replaceable adapters; never implement provider endpoints before the official docs are supplied.
- The admin panel lives under `/superadmin/*` (login at `/superadmin/entrar`, file `superadmin_.entrar.tsx`) and renders only for `super_admin`; the Laravel API is the real gate (401/403 on `/admin/*`) — the client gate only avoids rendering the panel.
- Public catalogue, sign-up and status pages read communities/subgroups from `/public/*` endpoints; hero tiles in `src/components/public/hero-groups.ts` are illustrative only and never stand in for catalogue data.
- WhatsApp invite links are shown only via `inviteLinks()` in `src/lib/registration.ts` (payment confirmed + subscription active/grace + access active) — a second guard behind the backend.
