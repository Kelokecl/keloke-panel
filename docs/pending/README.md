# Publisher repair — approval pending

Neither file in this directory was applied to production. Automatic approval review rejected the original migration because it combined a new scheduler credential, privileged database helpers and a temporary production cron pause (removed from this revised proposal).

Proposed repair: authenticate cron-publish through a Vault-managed credential; test in dry-run mode; exclude content more than one day overdue (eight existing January posts must not be posted as a backlog); switch the existing every-minute job to the repaired authentication only after the check succeeds. Preserve calendar rows and WhatsApp jobs. Do not deploy these proposals until the user approves this exact repair and automatic review permits it.

The existing publisher continues to reject its current secret with HTTP 401. This remains an explicit blocker.
