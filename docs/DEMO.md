# Demo

How to show Owl Plate live, and what may and may not be claimed. The commands and modes are in `RUNBOOK.md`. The It setup is in `prototypes/itcan/README.md`.

## Start

`make present` builds the web app when its sources change and starts the API and web together. The browser uses one port, 3017, and the API stays behind `/backend`. The launcher resets to the campus feed and prints the active vision and notification modes. Fixture vision and simulated notifications are the default, and both are labeled. The survey is off. For LAN or container access, use `make present-zima` and tunnel port 3017 over SSH.

- **Live vision**: `make present-openrouter` (Gemini via OpenRouter, which also powers the pickup assist) or `make present-live` (direct Gemini). Results are labeled **Live Gemini via OpenRouter**, **Live Gemini** or **Saved demo estimate**. Failures show an error and never fall back to the saved estimate.
- **Real push**: add `--notifications fcm` with private Firebase configuration. A joined student taps **Enable notifications**; on iPhone this works only from the installed Home Screen app. A listing alert opens `/student?drop=<id>`. Students who did not opt in, and the default launch, stay simulated.

## Walkthrough

1. **Host** (Home → Share Leftover Food): upload a food-only photo, review the estimate, adjust servings and allergens, confirm the safety checks, choose a verified Marietta building, and publish. The counts screen shows live inventory, pickup reviews, the pantry card and **Open pickup display** (It).
2. **Student** (Home → Find Food, or `/join`): enter a nickname and optional dietary restrictions. No location or GPS is requested. Browse the feed or the campus map. Dietary mismatches stay visible, with Reserve disabled.
3. **Reserve — hold 10 min**, then open the walking directions.
4. **Pickup**: take a food-only photo. A consistent assessment enables **Confirm pickup**. Otherwise the student asks the host to review.
5. **Pantry (simulated)**: the host requests a pantry referral, the coordinator accepts it on `/pantry`, and the host confirms the simulated handoff.
6. **Analytics** on `/dispatch` or `/impact`: counts, recovery rates and trends update. Student pickups and simulated pantry transfers stay separate.
7. **It Command Center**: tap **Refresh campus activity**, select a building, then **Analyze remaining food**. The paired Claude Code conversation answers on the page.

`/admin` holds diagnostics, the explicitly confirmed sample-activity dataset, the It base-URL status and the seeded A–E wave rehearsal. The rehearsal includes `/student?persona=X` links and the projector at `/admin/projector`, and it uses synthetic personas on unverified rehearsal geography.

## Claims discipline

Say which mode is running (fixture or live vision; simulated or real push). Allergen estimates always say **may contain, confirm with host**. Pickup assist always says that a photo cannot establish physical pickup or food safety. The pantry handoff is a simulation; nothing is sent to KSU CARE.

Do not claim survey results, measured vision accuracy, CARE partnership, approved redistribution rules, physical push delivery, Entra sign-in or a completed deployment without evidence. Verified facts and statistics come only from `docs/DOMAIN.md`. The It evidence status is recorded in `docs/IT_HANDOFF.md`.

## Rehearsal hygiene

- Reset (`make demo-reset`) before every run. A reset clears push registrations, so devices must re-enable alerts.
- Keep source photos free of people and identifying material.
- Fixture vision is an explicit choice, never a hidden retry after a live failure.
- Synthetic evaluation metrics are never presented as model accuracy.
