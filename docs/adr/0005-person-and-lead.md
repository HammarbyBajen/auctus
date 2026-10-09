# 0005: People and leads are separate tables

Status: accepted, 2026-10-09

## Decision
Contact details (name, email, phone) live once on a `person`. A `lead` belongs to a person and holds how they came in, their stage and their notes. A person can have more than one lead over time, for example a win-back lead after a cancelled membership.

## Why
It was decided before any real data was entered, so no data had to be moved. The same person arrives through the contact form, the chat bot and Mana, and one place for their contact details stops them drifting apart. It also lets a Mana member who was never a lead get a lead later without a second copy of their details.

## How matching works
A new contact is matched to a person by email (case-insensitive), then by phone (Swedish numbers written as 070..., +46 70... or 0046 70... are the same). A known person with a lead gets a note on their latest lead and any missing contact details filled in. A known person with no lead gets a new lead. An unknown person gets both.

## Consequences
Phone and email are not unique in the database, because matching is done in code and a person can legitimately share a family phone. The matching rules are covered by integration tests.
