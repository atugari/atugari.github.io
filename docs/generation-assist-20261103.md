# Generation assistance

The website starts its existing local Worker immediately. After 350 ms, ordinary 9×9 requests at Lv4–18 may also enter the owner-operated lab. Both searches keep exactly the selected difficulty. The first checked result wins; cancelling, resting, moving to another batch item and completing locally cancel the remote request. Unsupported configurations stay local. A failed or unavailable relay never terminates local generation.

The existing puzzle-api Worker/D1 accepts at most 20 pending requests, one per caller token, for 45 seconds. IDs and keys are independent random values. Reads and cancellations require the original caller identity. Creation and polling are rate-limited. Only the existing owner bearer credential can lease a request or submit a result. The server checks shape and matching level; the trusted owner's PC performs the expensive proof checks. No new cloud puzzle-backup service or Oracle account is needed.

Lab 0.3 reserves 1, 2, 4 or 8 foreground workers. Other phones can continue existing analysis. Phones search independent random candidates using the same bundled notebook generator (immutable release 2026.11.03.86; the generator is unchanged in .87). The PC checks uniqueness with the independent analyzer solver, checks the proposed solution and recomputes the exact notebook difficulty. Lv15–18 use their respective certified inspectors. Validation runs in an isolated Node worker with a 7-second deadline. One result is returned; sibling searches are cancelled by heartbeat. A stopped relay releases pending leases, and stale leases expire. Old corpus/results/config and phone participation URLs remain intact.

The owner credential is entered in the localhost management screen, retained in process memory and sent only to the fixed existing API. It never goes to phone workers, status responses or workspace files. Connecting requires the updated lab running on the user's PC; deploying the website alone cannot activate the user's physical devices.

Validation includes API ownership, request isolation, lease expiry, cancellation, queue limits, local/remote first completion, late messages, unavailable relay, independent difficulty/uniqueness checking and preservation of old analysis. Browser QA uses a mocked relay and an actual browser Worker. It is functional validation, not evidence of faster physical Xperia devices.

`NPGenerationAssist.getTimings()` in the notebook document reports the last 30 end-to-end generation times, including remote request, delivery, verification and return. No telemetry is uploaded. Compare repeated runs at the same level with 1 vs 4 reserved phones before claiming latency improvement. Lab-side times cover only dispatch through verified return. No speedup ratio is claimed without this physical measurement.

The other chat owns the 10,000 saved-puzzle performance tests. Additional explanation search remains conditional on examining that corpus first and is outside this change.
