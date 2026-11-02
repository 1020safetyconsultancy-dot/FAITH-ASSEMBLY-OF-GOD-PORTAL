# Faith Assembly of God — Church Management Portal

A mobile-friendly church staff portal with a GitHub Pages frontend and Supabase database.

## Features
- Members: membership starting date, contact details, ministry, status, baptism date
- Attendance: create services, check in members, check-in history
- Tithes & offerings: donor-linked or anonymous, category, payment method, receipt reference
- Expenses: category, fund, payee, purpose, voucher reference
- Finance: monthly receipts, expenses, balance, category breakdown, CSV export
- Roles: admin, pastor, secretary, attendance, treasurer
- Financial records are voided with a reason, not deleted; changes are audited

## Setup — administrator required

1. Create a **new Supabase project** for the church. In its **SQL Editor**, execute `database/schema.sql` once.
2. In Supabase > Authentication > Users, create a staff user (or invite them). Copy their exact User ID (UUID).
3. In the SQL Editor, assign the first administrator:
   ```sql
   insert into public.staff_roles(user_id, role)
   values ('REPLACE-WITH-EXACT-AUTH-USER-UUID', 'admin');
   ```
4. In Supabase project settings, copy the **Project URL** and **anon/publishable key**. Paste these into `config.js`. The anon key is for browser use and is only safe when RLS is enabled. **Never paste a service_role key, database password, or other privileged credential.**
5. Enable GitHub Pages: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow `.github/workflows/pages.yml` publishes the static files on every push to main. The first run may require Pages authorization.
6. Visit https://1020safetyconsultancy-dot.github.io/FAITH-ASSEMBLY-OF-GOD-PORTAL/ and sign in. The app is not ready to hold real church records until login permissions and RLS are verified.

## Security and operating notes
- Never store real member or offering data in public GitHub files.
- Members do not automatically have logins. Only staff created in Supabase Auth and assigned a role can enter the portal.
- Only admin/treasurer roles can see donation and expense transactions; other staff cannot access these tables through Supabase RLS.
- Administrative role assignment is done in Supabase SQL Editor or via a trusted administrative workflow.
- Record consent and provide a privacy notice before collecting personal data. Safeguard minors' information. Back up records and reconcile all cash with physical receipts.
- The website is hosted as a **public code/static frontend**, but real data is requested from Supabase only after staff authentication.
- This is an initial MVP; test authentication, data policies, record corrections, mobile layout and reports before production use.

## Important
The earlier Lovable project was built with TanStack Start server rendering and is **not** directly compatible with GitHub Pages. The files in this repository are a standalone static frontend designed to work on GitHub Pages; they do **not** automatically synchronize with Lovable.

## Technology
Vanilla browser JavaScript, HTML/CSS, Supabase JS, GitHub Pages.
