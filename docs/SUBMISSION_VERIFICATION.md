# Final submission verification

Application baseline: `ecb881285d5c5c9de9db9443650c3363b557bec5` (final UI corrections, including the Campus Rescue Command Center). The submission branch is `submission/owl-plate-final`. Application, dataset and test source remain byte-identical to that baseline. Changes are documentation, ignore rules and removal of obsolete presentation tooling/artifacts from the tracked tree.

## Reproduce from a clean checkout

Use Python 3.11, Node.js 20.9+ and GNU Make; `make setup` installs development dependencies. No private environment, live provider, running demo database or deployment work is needed for these checks.

| Check | Command | Result |
|---|---|---|
| Backend API | `.venv/bin/python -m pytest` | 343 passed; 1 existing Starlette/httpx deprecation warning |
| Frontend | `npm --prefix apps/web test` | 123 passed, 0 failed/skipped |
| Evaluation tests | `.venv/bin/python -m unittest discover -s data/eval -p 'test_*.py'` | 116 passed |
| Campus tests | `.venv/bin/python -m unittest discover -s data/campus -p 'test_*.py'` | 4 passed |
| Campus dataset | `.venv/bin/python data/campus/validate_marietta.py` | 43 verified records, 1,591 checks, 0 failures |
| It companion | `.venv/bin/python -m unittest discover -s prototypes/itcan/tests -p 'test_*.py'` | 99 passed |
| Offline eval CLI | `make eval` | Passed; synthetic scoring only, no measured model accuracy claim |
| Ruff | `make lint` (Python steps) | Check and format passed |
| ESLint and Prettier | `npm --prefix apps/web run lint` | Passed |
| TypeScript | `npm --prefix apps/web run typecheck` | Passed |
| Production build | `NEXT_PUBLIC_API_URL=http://localhost:8017 NEXT_PUBLIC_UI_FIXTURE_MODE=false npm --prefix apps/web run build` | Passed |
| OpenAPI/types | `make types && git diff --exit-code -- apps/web/openapi.json apps/web/lib/api.generated.ts` | Zero drift; openapi-typescript 7.10.1 |
| Whitespace | `git diff --check` | Passed |

**685 committed tests** across the five suites. Counts exclude untracked local deployment tests, browser harness assertions, and dataset-validator assertions. In particular, the canonical checkout's untracked origin-proxy test is excluded, along with its uncommitted middleware and deployment work. No untracked test is included in these results.

The source tree is frozen before the final clean-checkout rerun. Final handoff identifies that exact full SHA and reports any deviation from the results above. The independent reviewer reads the same frozen SHA; no claim of review completion is made here in advance.

## Browser and external-service evidence

Previous browser verification is documented in [FINAL_UI_HANDOFF.md](FINAL_UI_HANDOFF.md), [OPERATIONS_HANDOFF.md](OPERATIONS_HANDOFF.md) and other milestone handoffs. It used isolated fixture/log runtimes, synthetic data and desktop Chromium with mobile viewport sizes. Earlier runs required external Playwright/browser libraries; these are not repository dependencies. Browser harnesses are not equivalent to physical Android/iPhone testing. This submission preparation does not rerun the browser flow or alter the running demonstration.

Fixture pickup photos cannot establish physical collection. Physical FCM receipt, real CARE transfers, measured live vision accuracy and production readiness remain unverified. The It pickup display has a presenter's reported paired run; the command center has stand-in test coverage, without a paired session recorded in the repository. See the README's evidence status. No screenshots were added: existing captures depict an older UI.

## Security and publication

Publication must wait for the history audit and independent final review. The manager additionally scans publication-reachable blobs and commit messages for common credential formats; pattern scans alone cannot guarantee the absence of every secret. Final handoff records coverage, counts and findings. No credentials are reproduced in reports.

Only the submission branch is proposed for publication, preserving its complete reachable development history. Unrelated worktrees, local deployment work, checkpoint refs and private files are excluded. Historical recordings and slides remain reachable in development history, as required by the instruction not to rewrite history; the final repository tree contains none. Do not publish all local refs or use a mirror push.

No push, main merge, cloud deployment or Nudox installation/indexing was performed. Publishing and merging require the owner's explicit approval.
