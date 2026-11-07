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

- Frontend is hosted on Netlify; the authoritative application database and Auth are the owner's external Supabase project; WhatsApp connectivity is the Railway Baileys service.
- Browser code may use only Supabase URL + anon/publishable key for Auth. All privileged reads/writes and WhatsApp bridge calls go through Netlify Functions; service-role and bridge tokens remain server-side.
- Every privileged function validates the Supabase access token with Supabase Auth and checks `app_metadata.role === "super_admin"` plus the owner account before using the service-role key.
- Money is integer Kwanza end-to-end; the active plan is free for the first 30 days, then 1,000 Kz per 30-day renewal with a 5-day grace period.
- WhatsApp group imports are read from the connected Baileys account, persisted to `whatsapp_groups`, `members`, and `group_memberships`, and must be idempotent.
- Never remove a WhatsApp participant until the subscription has passed its expiry and grace period; the connected account must be a group administrator. Log every operation.
- Never invent contacts, payment confirmations, QR states, group records, or dashboard numbers. Display only data returned by Supabase/Railway.
- The owner must explicitly approve production deployment/merge; work in the audit branch until reviewed.
