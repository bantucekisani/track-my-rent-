# Landlord Financial QA Checklist

Use this before onboarding real landlords or after every accounting-related release.

## 1. Lease Creation

- Create a lease that starts this month and confirm one `rent` ledger entry is created for the correct `periodMonth` and `periodYear`.
- If a deposit is entered, confirm one `deposit` ledger entry is created for the same accounting period.
- Confirm the lease appears correctly on the dashboard, tenant profile, payments, invoices, and reports pages.

## 2. Manual Rent Charging

- Run manual rent charge for a chosen month.
- Confirm no duplicate `rent` entries are created when the action is repeated.
- Confirm the invoice for that lease/month is created once and reused.

## 3. Manual Payment Recording

- Record a payment for the current month.
- Record a payment with a backdated `paidOn` date and a selected accounting period.
- Confirm the payment appears in:
  - payments table
  - tenant ledger
  - invoice balance
  - dashboard rent collected
  - reports payment history
- Confirm partial payments move rent status from unpaid to partial.
- Confirm full payments move rent status to paid.

## 4. Arrears

- Create unpaid rent and confirm rolling arrears increases.
- Add a partial payment and confirm arrears decreases but does not clear fully.
- Add a full payment and confirm arrears clears for that lease/tenant.
- Check:
  - dashboard rolling arrears
  - reports rolling arrears
  - tenant profile arrears

## 5. Utilities and Damages

- Post a utility charge without manually picking a period and confirm it lands in the current accounting month.
- Post a utility charge with an explicit period and confirm reports use that period.
- Reverse a utility charge and confirm balances reduce correctly.
- Post a damage charge and reverse it.
- Confirm invoices and arrears reflect both the original and reversal correctly.

## 6. Late Fees

- Create a scenario where rent is overdue after the configured grace period.
- Confirm one `late_fee` entry is created for the correct month.
- Confirm late fee amount appears in ledger, invoices, arrears, and reports.
- Confirm the scheduler does not duplicate late fees when it runs again.

## 7. Month-End and Year-End

- Test November -> December.
- Test December -> January.
- Test a lease starting on the 31st for a month with fewer days after it.
- Confirm due dates, rent charges, arrears, and late fees still land in the correct accounting month.

## 8. Statements and Invoices

- Generate an invoice PDF and compare totals against ledger entries for the same period.
- Email an invoice and confirm the attachment opens correctly.
- Generate a tenant statement PDF and confirm the running balance matches the tenant ledger.

## 9. Multi-Screen Consistency

- Pick one tenant and verify the same balance appears across:
  - dashboard
  - reports
  - invoices
  - tenant profile
  - ledger

## 10. Regression Notes

- Log the exact tenant, lease, month, and expected amount for every failed case.
- Keep screenshots and exported PDFs for any mismatch before fixing code.
