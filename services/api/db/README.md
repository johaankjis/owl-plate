# Backend integration (frozen v1 contract)

Manager composition imports:

```python
from services.api.application import Backend
from services.api.db.session import create_database
from services.api.routes.api import build_router
from services.api.vision.service import build_vision_provider, validate_photo

engine = create_database(database_url)
provider = build_vision_provider()
backend = Backend(
    engine,
    analyze=provider.analyze,
    validate_photo=validate_photo,
    notify=notification_adapter.notify,
    demo_mode=demo_mode,
    auth_mode=auth_mode,
)
app.include_router(build_router(backend))
```

`analyze(photo: bytes, host_note: str = '') -> tuple[VisionEstimate, Literal['fixture', 'gemini']]`
is synchronous. `validate_photo(photo: bytes) -> bytes` validates/resizes in memory.
`notify(invite_id: str, student_id: str, drop_id: str, *, mode='seeded_waves') -> None`
is synchronous; no external send occurs unless this adapter is supplied. Only the
sanitized host listing JPEG returned by `validate_photo` for `POST /drops` is stored, in
the `DropPhoto` table behind `services/api/storage/photos.py`: drafts keep it two hours,
publishing moves the deadline to `min(created_at + 24h, expires_at)`, and every
transaction, tick and demo reset purges expired photos first. It is served only by
Bearer-authenticated, per-role scoped `GET /drops/{id}/photo` (404 for anything out of
scope). Pickup-verification photos are never stored. Seeded waves pass the legacy invite ID positionally. Campus-feed drops call
it once per eligible student at publish with the `FeedNotification` outbox ID and
`mode='campus_feed'`; the push links `/student?drop=<id>` with a stable per-drop tag and
Web Push topic. Ticks, joins, reservations and registrations never enqueue more.
Push-token registration returns 503 until manager supplies encrypted storage/access.

The service owns SQLModel table creation via `create_database`; no root wiring changes needed.
`Backend.tick(advance_seconds=0)` uses the same transaction as claims. Call it every
10 seconds from the manager lifespan scheduler (run synchronous calls in a worker
thread). Only demo-host HTTP `/demo/tick` may advance its persisted clock offset.
`clock: Callable[[], datetime]` is injectable and must return aware UTC times.
A `buildings: Mapping[str, str]` constructor option supplies verified building-code
-> H3 res11 cells; demo mode automatically includes the private seed origin.
Demo tokens are accepted only when both demo_mode=True and auth_mode='demo'.
Production composition must supply `authenticate(token: str) -> Actor` after real
auth verification; Actor(role='host'|'student'|'projector', id=...) is in application.py.
Projector and reset/advance/pickup endpoints remain demo-only.

Notifications use a persisted outbox after the wave transaction commits. Failed
sends remain pending for later ticks. Adapters should deduplicate by invite_id
(delivery is at least once across a crash). Only IDs cross the adapter boundary.
SQLite uses BEGIN IMMEDIATE; Postgres locks one singleton coordination row before
reading mutable state. This deliberately serializes this milestone's writes across
processes, including claims, reset, demo clock advances and overlapping ticks.

## Local fixture composition

For an isolated demo without manager adapters, inject
`services.api.application.fixture_vision` as `analyze`. A genuine image validator
is still required for HTTP use; tests use a deliberately trivial validator to
isolate business behavior. Source remains `fixture` in every response. The service
discards vision religious tags, adds all common allergens for confidence <0.6,
and requires ingredient confirmation to remove estimates during host review.

## Verification and limits

Run from the repository root with the Python 3.11 environment:

```bash
python -m pytest -q services/api/tests
python -m ruff check services/api/application.py services/api/db services/api/dispatch services/api/routes services/api/tests
python -m ruff format --check services/api/application.py services/api/db services/api/dispatch services/api/routes services/api/tests
```

Tests cover all hard gates, weighted ranking, capacity, retry identity, independent
sessions racing for the last serving, tick overlap, exact TTL boundaries, release,
pickup, drop expiry, ring exhaustion, durable restart, reset, H3 distances, synthetic
map access, ownership, safety review, and notification retry.

PostgreSQL DDL/locking SQL is checked for compilation; a live PostgreSQL server was
not available for this worker's validation. Install a PostgreSQL SQLAlchemy driver
in deployment (manager-owned dependency configuration). Initial schema uses
`SQLModel.metadata.create_all`; changes after the milestone need migrations.
Use file-backed SQLite (the documented local configuration), not an in-memory
SQLite URL for threaded serving.

Root `uv pip install -e '.[dev]'` currently fails setuptools discovery because both
`data` and `services` are top-level packages. Worker installed dependencies from
`pyproject.toml` without changing manager-owned packaging. Push registration is
intentionally 503, not a simulated success; encrypted token storage/access and
real sign-in/provisioning remain manager integrations. Backend does not log photo
bytes, provider exception details, contacts, or tokens, and persists no photo other
than the short-lived sanitized host listing photo described above.
