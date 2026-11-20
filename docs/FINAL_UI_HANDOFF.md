# Final submission UI cleanup

Baseline `6e14f39818b6a965033f8f5853bca3c002dd5510`.
Branch `feature/final-ui-cleanup`. Local only; no push, cloud deployment or main merge.

## Product changes

The host pantry card has no prominent simulation badge or demo destination suffix,
and links to “View pantry”. Simulation and official KSU policy disclosures remain
inside the explicit request and handoff dialogs. Acknowledgments start unchecked;
confirmation cannot proceed until acknowledged. Existing action, quantity, ownership,
expiry and concurrency guards are unchanged.

Pantry referrals retain actual sanitized host-uploaded photographs while the photo
is available. Missing/deleted photos use a category illustration explicitly labeled
“Illustration”, including its accessible name. Completed, declined and expired
referrals use compact rows; student and pantry counts remain distinct.

Analytics now leads with four headline metrics, a large daily trend and schematic
campus visualization, compact inventory/category breakdowns, consolidated secondary
metrics and recent activity alongside active listings. Light/dark themes, reduced
motion and responsive layouts remain supported. Student pickups and simulated pantry
transfers stay separate; existing rates and illustrative estimate definitions are
unchanged. Recording datasets retain visible provenance. Internal dataset controls
remain in `/admin`; `/impact` still shares `/dispatch`.

## Missing pantry photograph investigation

A read-only inspection of the existing canonical database found one pantry referral:
it and its listing were expired, with no retained photo. Two other live listings
still had photos, but no pantry referrals. Thus the inspected missing photo was the
expected retention outcome, not a coordinator Bearer authorization failure.

No retention or access policy was relaxed. Listing photos are sanitized JPEGs,
metadata removed, retained until listing expiry (never more than24hours; draft2hours).
Expired photos are purged; private pickup evidence remains unstored/unexposed.
Recording datasets intentionally contain no photos. The coordinator may see a live
listing photo only once its referral exists, with both demo gates enabled.

## Verification

Run checks in a clean checkout using its own cwd/PYTHONPATH and the canonical `.venv`:

- API343; web123; evaluation116; campus4; It companion99.
- Registry43verified buildings,1591checks,zero failures.
- Ruff check/format115Python files; ESLint/Prettier/types/production build.
- OpenAPI and generated TypeScript regeneration: zero drift.
- `scripts/verify_operations_ui.cjs` follows actual host request, pantry acceptance
  and host handoff dialogs, verifying unchecked/disabled safeguards, policy content,
  authenticated image loading and denial without Bearer or with query tokens.
- Optional `OWL_TEST_FOOD_PHOTO=/absolute/path/to/food.jpg` uploads an actual food
  photograph through the host UI. Without it the harness explicitly uses synthetic
  pixels. Stock photograph provenance is recorded in ignored local evidence.
- UI harness covers iPhone390x844, Android412x915 and desktop1440x1000; actual scoped
  photos, search/map/details/reservation/photo-assisted pickups, auto-refresh,
  three-serving acceptance, date filters, confirmed admin dataset load, expired
  compact illustrations, light/dark/reduced-motion, `/impact`, overflow/errors.

To run the browser harness, first start **an isolated** fixture/log runtime at3027/8027:

```bash
PYTHONPATH=. .venv/bin/python -m scripts.present \
  --port 3027 --api-port 8027 --vision fixture --notifications simulated --rebuild
```

Then set `OWL_WEB_URL=http://127.0.0.1:3027`, `OWL_API_URL=http://127.0.0.1:8027`,
`OWL_PLAYWRIGHT_MODULE`, `OWL_BROWSER_EXECUTABLE` and any local browser library paths,
and run `node scripts/verify_operations_ui.cjs`. The harness resets only this
explicitly guarded fixture candidate. Never point it at3017or live providers.

## Manual walkthrough

1. Upload a food photo on `/host`, review, publish3servings at a verified building.
2. Use two separate student browser sessions to reserve and explicitly complete
   photo-assisted pickups. Verify directions and host counts.
3. Open the host pantry request dialog: read policy, acknowledge, request1serving.
4. On `/pantry`, verify the actual food image. Open acceptance, read policy/simulation,
   acknowledge and accept. Host explicitly confirms the simulated handoff.
5. Analytics updates to3published,2student pickups,1simulated pantry transfer,
   zero available/student held/pantry held,66.7%student recovery,100%combined demo.
6. On an isolated fixture runtime, use `/admin` to explicitly load sample activity;
   check dates, charts, compact expired illustrations and mobile/dark layouts.

Physical push receipt, actual food collection/CARE transfer, live-model accuracy and
paired It interaction are not established by fixture browser tests. The It Campus
Rescue Command Center and all backend source are byte-identical to baseline.

Fable `claude-fable-5-2` source commit `57c96c157bf7d7eb04e511feba2e1cc1eb9e2387`,
integrated as `0db0898`. Worker:
<t3-thread://v2/214ef463-8ab8-4ced-aae2-db0dbf63011f/thread:delegated-task:command%3Amcp%3A810e5b00-8c72-499f-9921-e526f0e32ffd%3Adelegate-task%3A34f6fad5-0dac-415f-9389-bcf830c49d1e>

Local final proof lives in `test-results/operations-ui/`,
`test-results/final-ui-checks.json`, `test-results/final-ui-review.md` and
`test-results/final-ui-runtime.json`. Review and runtime outcomes are recorded there
after verification; this source document does not claim them in advance.
