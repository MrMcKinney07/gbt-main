# Section 15 answers assumed by this build

The build prompt requires answering these before writing code. Nobody with authority to
answer the business/legal ones (states of operation, pay model, legal sign-off, budget) was
available in this session, so this build proceeds on the spec's own stated defaults where
one exists, and stubs/flags everything else instead of guessing. Treat every item below as
provisional and confirm with the actual operator before this touches a real canvass.

1. **States seeded**: CA, IL, TX, CO, CT, NY (see `db/migrations/0009_compliance.sql`) —
   chosen because the build prompt cites specific statutes for each, not because they're the
   real launch states. **Not attorney-reviewed** (`last_reviewed_by` is null on every row).
2. **Pay model**: schema supports `hourly | per_door | volunteer` (`shifts.pay_type`); no
   default assumed. Flagging per the prompt: if the real operator picks `per_door`, the
   fraud-scoring weights in a future verification engine should be tightened accordingly.
3. **Voter file provider**: schema-level support for L2/VAN/i360/TargetSmart/Aristotle/state
   file/manual; demo data uses `l2`. No importer is implemented for any of them.
4. **VAN bidirectional sync**: not implemented. Export-only is assumed sufficient for now.
5. **Legal review of consent language**: not done. `apps/mobile`'s consent screen copy is
   drafted from the spec's own required disclosure content (5.2, 8.6, 11.3, 11.3a) and needs
   a real attorney pass before use.
6. **Platforms**: Expo scaffold targets both; per the prompt's own steer ("field programs
   skew Android heavily"), if only one platform gets real device testing first it should be
   Android.
7. **Worst-case turf profile**: unknown; the door-time default (90s) from 7.1 step 6 is used
   unmodified since there's no real contact_attempts history yet to learn from.
8. **Budget for Valhalla/geocoding/ASR**: none of these are wired up (see ARCHITECTURE.md).
9. **Human owner of the fraud review queue**: not assigned. The `field_director` and
   `compliance_officer` roles exist with the right permissions; no staffing decision is made.
10. **No auto-termination/auto-pay-dock/auto-delete**: honored structurally — nothing in
    `apps/api` writes to `users.status`, pay records, or hard-deletes `contact_attempts` /
    `photo_verifications` as a side effect of a score crossing a threshold. Every such action
    requires an authenticated human actor and is audit-logged.
11. **Photo interval profile**: spec defaults used as-is — Beta(5, 2) over 5-30 doors, mode
    22, capped at 4 prompts/shift, 20-minute floor between prompts
    (`0008_photo_verification.sql` column defaults).
11a. **Watchdog window**: spec default used as-is — 15 minutes, with the 10-45 minute hard
    bounds enforced at the column level (`safety_watchdog_state.window_seconds`, validated in
    the API, not the DB, since the automatic tightening rules in 8.2 make it context-
    dependent).
11b-20. Not independently answered; see ARCHITECTURE.md's "what's deliberately not built"
    section for the corresponding stubs (no timed check-in exists anywhere in this codebase
    — confirmed by the absence of any periodic-presence-ping code path, which is the actual
    guarantee section 15 question 16 is asking for).
