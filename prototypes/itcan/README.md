# Owl Plate pickup companion on It (itcan.do)

This sponsor-track companion is part of the host demo. The Owl Plate **Pickup
counts** screen opens a real paired It page for the published drop. On that
page, **What's left?** sends the exact drop UUID and page ID to the Claude Code
conversation that created it. Claude runs `whats_left.py`, which reads the
existing host aggregate endpoint and patches that same page.

The companion never receives a host credential, student identity, push token,
or per-student status. The Mac-side helper uses the synthetic `demo-host`
credential only to call `GET /drops/{drop_id}` through Owl Plate's local web
proxy. A page ID must match its drop UUID before the helper will patch it.

## Files

- `whats-left.html` — paired It screen and `whats_left` action.
- `create_companion.py` — creates `owl-whats-left-{drop_uuid}` with immutable
  drop/page binding in the initial It state.
- `whats_left.py` — validates that binding, reads aggregate counts, and runs
  `it patch` on the same page.
- `tests/test_whats_left.py` — known-answer and privacy-focused stand-in tests.

## One-time Mac pairing

Run these on the presentation Mac. The It add-on needs Claude Code 2.1.287 or
newer.

```bash
claude --version
curl -fsSL https://itcan.do/install.sh -o ~/Downloads/it-install.sh
less ~/Downloads/it-install.sh
IT_INSTALL_PLAIN=1 IT_INSTALL_NO_PATH=1 sh ~/Downloads/it-install.sh
~/.it/bin/it setup --only claude-code
claude plugin list --json
~/.it/bin/it network off
~/.it/bin/it site --no-open
```

Open the URL printed by `it site --no-open` in the Mac browser within ten
minutes. In a Claude Code conversation already open during setup, run
`/reload-plugins`. Keep the `it site` process running.

Put the printed **site origin** (scheme, host, and port; no `/p/...` path) in the
gitignored Owl Plate `.env` on the machine that builds the web app:

```dotenv
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://127.0.0.1:PORT
```

If Owl Plate runs on ZimaOS while It runs on the Mac, the browser link must use
an It site origin the Mac browser can reach. Keep the existing Owl Plate tunnel
open separately:

```bash
ssh -N -L 3017:172.23.0.2:3017 <zima-user>@192.168.0.126
```

Restart `make present` after setting the companion base URL. The launcher
fingerprints this public value and rebuilds when it changes.

## Exact demo flow

1. In Owl Plate, **Share food**, upload the demo tray, set **2 servings**, check
   the host safety review, and publish. Stay on **Pickup counts**.
2. In the Claude Code conversation that will answer the It page, create and
   open the companion for the active published drop:

   ```bash
   python3 prototypes/itcan/create_companion.py --base http://localhost:3017 --open
   ```

   The command prints the page URL and an exact action-handler command. The
   page slug includes the drop UUID, so a later active drop cannot redirect it.
3. Back on Owl Plate **Pickup counts**, click **Open pickup companion**. It opens
   the matching `owl-whats-left-{drop_uuid}` page.
4. Tell the same Claude conversation once:

   > When this page sends `whats_left`, verify that `page_id` equals
   > `owl-whats-left-{drop_id}`, then run the exact action-handler command
   > printed by `create_companion.py`. Patch the page; do not choose invitees or
   > request any student data.

5. On It, tap **What's left?**. Expect **2 available, 0 held, 0 picked up**.
6. In Owl Plate, join as a student, open the invite, **Reserve**, then
   **Confirm picked up**.
7. Tap **What's left?** again on the same It page. Expect **1 available, 0 held,
   1 picked up** for the same drop UUID.

A tap counts as sponsor verification only when it arrives in the Claude
conversation and the real paired It page changes. The Python and browser tests
are stand-ins and must remain labeled as such.

## Local checks

```bash
python3 -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
cd apps/web && npm test
```

The helper can also be checked without It by supplying an exact drop UUID:

```bash
python3 prototypes/itcan/whats_left.py --base http://localhost:3017 --drop-id <drop-uuid>
```
