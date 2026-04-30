# Deployment Readiness Checklist

Use this before any staging or production release.

## Security

- Rotate all secrets currently stored in local `.env` files before launch.
- Move secrets to your hosting provider's secret manager or environment configuration.
- Set a strong `JWT_SECRET`.
- Set `FRONTEND_URL` to the real deployed frontend origin.
- Set `CORS_ORIGINS` to the exact allowed frontend origins.
- Verify password reset email delivery from the real environment.

## Infrastructure

- Confirm MongoDB backups are enabled.
- Confirm logs are available and searchable.
- Confirm the server restarts automatically on failure.
- Confirm cron/scheduler jobs run exactly once in production.

## Email and Notifications

- Verify `EMAIL_USER`, `EMAIL_PASS`, and sender identity.
- Test password reset email.
- Test lease signing email.
- Test invoice email.
- Test tenant statement email.

## Application Config

- Verify backend serves `/api` correctly behind your reverse proxy or domain.
- Verify frontend `API_URL` resolves correctly in production.
- Verify file uploads under `/uploads` work in the deployed environment.

## Data Integrity

- Run the landlord financial QA checklist before release.
- Test a fresh landlord account from registration to first lease.
- Test at least one real-world sample property with:
  - multiple units
  - one fully paid tenant
  - one partially paid tenant
  - one tenant in arrears

## UX and Support

- Check mobile layout for login, dashboard, payments, reports, leases, and tenant profile.
- Remove visible encoding artifacts or broken labels before launch.
- Add a support email or support path visible to landlords.
- Add a privacy policy, terms, and subscription policy review before public release.

## Release Gate

- No known broken routes or missing assets.
- No accounting period mismatches remain.
- No blocker bugs in rent, invoices, payments, arrears, utilities, damages, or statements.
- At least one full staging walkthrough completed successfully.
