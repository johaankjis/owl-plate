# Owl Plate pickup display on It (itcan.do)

The host's **Open pickup display** button (on the published listing's counts
screen) opens a real paired It page for that one listing. On the page,
**What's left?** sends the listing's ID and page ID to the Claude Code
conversation on the Mac that created the page. That conversation runs
`whats_left.py`, which reads the listing from Owl Plate and patches the same
page. The page state is defined in `STATE_CONTRACT.md`.

The display shows the food, the pickup location, and these counts: total,
available, student reservations, completed pickups, pantry reserved, and pantry
transfers (simulated). It never receives a credential, a student identity, a
photo, or per-student status. The Mac helper uses only the synthetic
`demo-host` bearer, works only in demo mode, and goes through the Owl Plate
tunnel.

## Files

- `whats-left.html`: the paired page. It uses only It's documented page API
  (`It.onState`, `data-it-bind`, `data-it-show`, `It.action`).
- `create_companion.py`: creates `owl-whats-left-{listing id}` with the
  listing binding and a first real snapshot, then prints the page URL and the
  exact action-handler command.
- `whats_left.py`: validates the binding, reads `GET /drops/{id}`, and runs
  `it patch` on the same page. Missing data fails closed and keeps the last
  numbers.
- `tests/`: stand-in tests that use a stub server and a fake `it` binary. They
  are not sponsor evidence.

Both helpers use only the Python standard library, so they run with the Mac's
built-in `python3`.

## One-time Mac setup

It 0.1.45 is the current release. The Claude Code add-on (`it-bridge@it`)
needs Claude Code **2.1.287 or newer**. Read the installer before running it.
It does not use sudo.

```bash
claude --version
curl -fsSL https://itcan.do/install.sh -o ~/Downloads/it-install.sh
less ~/Downloads/it-install.sh
IT_INSTALL_PLAIN=1 IT_INSTALL_NO_PATH=1 sh ~/Downloads/it-install.sh
~/.it/bin/it setup --only claude-code
claude plugin list --json          # it-bridge@it → "enabled": true
~/.it/bin/it network off           # pair the Mac browser only
~/.it/bin/it site --no-open        # open the printed link in a Mac browser within 10 min
```

Run `/reload-plugins` in any Claude Code conversation that was already open.
Never paste the pairing code or the pairing link into chats or reports.

### Copy the companion files to the Mac

Run this from the Mac. It copies only this folder out of the Owl Plate
container on ZimaOS:

```bash
mkdir -p ~/owl-plate-it && ssh <zima-ssh-user>@192.168.0.126 \
  "docker exec 1ce68abde0c3 tar -C /home/node/projects/owl-plate -cz prototypes/itcan" \
  | tar -xz -C ~/owl-plate-it
```

### Keep the Owl Plate tunnel open

In its own terminal:

```bash
ssh -N -L 3017:172.23.0.2:3017 <zima-ssh-user>@192.168.0.126
```

### Point the host button at It

The host button builds `{origin}/p/owl-whats-left-{listing id}`. It's docs do
not state the page path, so compare it once with the `Page:` URL that
`create_companion.py` prints. Put the It site origin, without a path, in the
gitignored Owl Plate `.env`, then restart the launcher. The launcher rebuilds
when this value changes.

```dotenv
NEXT_PUBLIC_IT_COMPANION_BASE_URL=http://localhost:4700
```

Admin → **Pickup display (It)** shows whether this value is set (origin only)
and lists the troubleshooting checks.

## Recording walkthrough (three servings)

1. **Owl Plate, host:** Share food → photo → Get estimate → set **3** servings
   → tick the three safety checks → Publish. Stay on the counts screen.
2. **Mac, the Claude Code conversation that will answer taps:**

   ```bash
   cd ~/owl-plate-it && python3 prototypes/itcan/create_companion.py \
     --base http://localhost:3017 --open
   ```

   Then tell the conversation once:

   > When the owl-whats-left page sends `whats_left`, check that its `page_id`
   > is `owl-whats-left-{drop_id}` for the listing above, then run the exact
   > "Action handler" command printed above. Do not request student data.

3. **Host:** click **Open pickup display**. It opens the same page.
4. **It page:** tap **What's left?**. Expect **3** available of 3.
5. **Student phone:** Find food → join → **Reserve – hold 10 min**.
6. **It page:** tap **What's left?**. Expect **2 available · 1 student reservation**.
7. **Student:** take the pickup photo → **Confirm picked up**.
8. **It page:** tap **What's left?**. Expect **2 available · 1 completed pickup**.

A tap counts as sponsor evidence only when it arrives in the Claude Code
conversation as an `[It] … whats_left … [action …]` message and the real paired
page changes.

## Campus Rescue Command Center (sponsor showcase)

One campus-wide page, `owl-rescue-command-center`, next to the per-listing
pickup display. It shows the interactive isometric campus map, live
inventory, rescue metrics, and an agent panel whose text is written only by
the paired Claude Code conversation. The page contract is in
`STATE_CONTRACT.md` under "Command center page"; `campus_center.py` builds
every patch, `create_command_center.py` publishes the page, and
`command-center.html` renders it. The pickup display above stays exactly as
it is and remains the fallback.

### Publish the command center on the Mac

After the one-time setup and the file copy above, in the Claude Code
conversation that will answer actions:

```bash
cd ~/owl-plate-it && python3 prototypes/itcan/create_command_center.py \
  --base http://localhost:3017 --open
```

It prints the page URL and the exact handler commands for every action:
refresh campus activity, select a building, inspect a listing, What's left?,
the analysis brief, agent responses and recommendations, and dismissing
recommendations. Tell that conversation once:

> When the owl-rescue-command-center page sends an action, check that its
> `page_id` is `owl-rescue-command-center`, then run the matching "Action
> handler" command printed above. For `analyze_remaining_food` and
> `show_recommendations`, run the `--brief` command first, read the facts it
> prints, and write your own short response or recommendation list with
> `--respond` / `--recommend`. All handlers are read-only against Owl Plate.
> Do not request student data.

### Update a published page after changing the files

`it patch` updates only page state, never the page's HTML. After pulling a
new `command-center.html` (or `whats-left.html`) into `~/owl-plate-it`,
re-run `create_command_center.py` (or `create_companion.py --drop-id …`) in
the same conversation: the command center's page id is fixed, and the pickup
companion's is derived from its listing, so both bindings and their handlers
stay the same while the page is republished with the new HTML and a fresh
real snapshot.

### Acceptance walkthrough (two buildings)

1. **Owl Plate, host:** publish servings at two different Marietta buildings.
2. **Mac:** publish the command center, then the page on the paired browser.
3. **It page:** both buildings glow gold with counts; select one and inspect
   its listing; tap **Refresh campus activity**.
4. **It page:** tap **Analyze remaining food**. The conversation runs
   `--brief` and answers in its own words on the page.
5. **Student phone:** join and reserve one serving; the command center's
   **Refresh campus activity** reconciles the counts.
6. **Student:** complete the photo-assisted pickup; refresh again.
7. Expect the map, counters, selected listing and agent panel to update,
   and each action to arrive in the conversation as an
   `[It] … [action …]` message.

## Troubleshooting

| Symptom | Check |
|---|---|
| Button says the display isn't connected | `NEXT_PUBLIC_IT_COMPANION_BASE_URL` missing; set it and restart the launcher |
| Page says it isn't linked to a listing | Re-run `create_companion.py` for the published listing |
| Tap does nothing in Claude | Same conversation still open? `/reload-plugins`; `claude plugin list --json` |
| "Couldn't reach Owl Plate" | Tunnel to port 3017 down |
| Counts look stale | Each tap reads fresh data; a different listing needs its own page |

## Local checks (stand-ins)

```bash
python3 -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'
cd apps/web && npm test
```

Pantry transfers shown here are simulated. They are not a KSU CARE acceptance,
a physical transfer, or catering-policy approval.
