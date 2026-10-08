# 09: Lead intake from leadfabrik

**What to build:** Leadfabrik posts new leads (contact form and chat bot) to an authenticated endpoint in the CRM, with the source stated by leadfabrik and any UTM data. The same lead sent twice is stored once, and a repeat submission from a known person is added to their existing lead. Built against an assumed payload until Erik's sample arrives.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The endpoint rejects requests without a valid key
- [ ] A lead arrives with source, name, email, optional phone and UTM or landing page when available
- [ ] Retries with the same leadfabrik lead id do not create duplicates
- [ ] A new submission from a known email (then phone) adds a note and counts as activity on the existing lead
- [ ] The raw submission is stored with its timestamp
- [ ] A contract test uses a sample payload and is updated when the real one is received
