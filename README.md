# Faith Assembly of God — Church Management Portal

Private church records must be stored in a secured database, **not** in this public repository.

## Scope
- Member directory: registration, membership start date, status, ministry, contact details
- Attendance: Sunday services, events, member check-in, history and reporting
- Giving: tithes, general offerings, missions, special funds, anonymous giving
- Expenses and fund accounting: category breakdown, balances and reporting
- Access roles: administrator, pastor, membership secretary, attendance staff, treasurer

## Deployment status
This repository has been initialized but the application code has **not** yet been uploaded or deployed. Do not enter real member information or giving records into an unverified demonstration.

The app project currently lives at:
https://lovable.dev/projects/c24fa6c4-23b9-4139-a13f-e5d48864e083

## Repository naming
The repository was created as `https-1020safetyconsultancy-dot.github.io-FAITH-ASSEMBLY-OF-GOD-PORTAL-`.
For the intended GitHub Pages URL, rename it in GitHub **Settings → General → Repository name** to:
`FAITH-ASSEMBLY-OF-GOD-PORTAL`

The expected Pages site, once configured and deployed, would be:
https://1020safetyconsultancy-dot.github.io/FAITH-ASSEMBLY-OF-GOD-PORTAL/

## Security requirements
- Use server-side authorization and Supabase row-level security.
- Never commit Supabase service-role credentials, user passwords, donor data, or member lists to this repository.
- Verify access controls before accepting production church information.
