# 06: Settings: thresholds and weekend rules

**What to build:** Owners change the 24-hour, 4-hour and 7-day thresholds and choose which days the deadline clock runs, so a Saturday-night lead is not shown as overdue unfairly.

**Blocked by:** 05

**Status:** done (2026-10-13)

- [x] Thresholds are editable by Owners only
- [x] The deadline clock can be set to skip chosen weekdays or days off
- [x] The landing page uses the new values immediately
- [x] A lead arriving on a skipped day gets its deadline counted from the next running day

Notes: under Inställningar → Tidsgränser och helger. The clock applies to the first-contact deadline; stalled days stay calendar days. Running weekdays default to all seven, so nothing changed until an owner chooses. No weekday ticked means no first-contact deadline. The unused atRiskDays key in thresholds was dropped from the type (the at-risk threshold is studio_settings.at_risk_days).
