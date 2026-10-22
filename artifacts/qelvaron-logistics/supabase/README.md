# Supabase setup

1. In the Supabase SQL Editor, run the complete `schema.sql` file.
2. Turn off public signups (or use invite-only access), then create the first operator in Supabase Authentication using the email address they will use to sign in at `/admin/`.
3. Copy that Auth user's UUID and run the bootstrap statement below in the SQL Editor:

   ```sql
   insert into public.qelvaron_admins (user_id)
   values ('REPLACE_WITH_AUTH_USER_UUID'::uuid)
   on conflict (user_id) do nothing;
   ```

4. Set these Vite environment variables in both Replit (for its preview) and Vercel (for deployment):

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

5. Rebuild/redeploy after changing environment variables.

The browser app uses only the Supabase publishable key. Do not put a `service_role` key or database password in a `VITE_` variable. Row-level security allows shipment, tracking-update, and email-draft access only to UUIDs added to `qelvaron_admins`. Public tracking is handled by `lookup_shipment`, which deliberately returns no contact or payment details.

Shipment fees are stored in `shipments.custom_fee`. The form treats `total_amount` as the shipping charge plus custom fee; payments and balances use that combined total. The schema adds the fee column to an existing `shipments` table when rerun.

The supplied sample shipment records are intentionally not migrated: they were synthetic demo data, not real operations records.
