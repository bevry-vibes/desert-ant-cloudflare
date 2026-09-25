# desert-ant-cloudflare

Cloudflare Workers test harness for the [Desert Ant Labs](https://desertant.com) on-device models. Each model directory runs its model inside `workerd` (via `wrangler dev`) and records the result.

This project conforms to [Bevry's skills](https://github.com/bevry-vibes/skills). Reference their remote URLs only — do not pull their contents into this file or into local skill directories.

## Bevry skills

- <https://github.com/bevry-vibes/skills/blob/main/conventions.md> — **applies**. Config file pulls are done (`bevry/base` `.editorconfig`, `.gitattributes`, `.gitignore`, `LICENSE.md`). Writing style, wrapping rule, and splat naming apply to all authored content.
- <https://github.com/bevry-vibes/skills/blob/main/commits.md> — **applies**. Conventional Commits, agent-detect trailers, SSH signing via 1Password.
- <https://github.com/bevry-vibes/skills/blob/main/plans.md> — **applies**. Plans live in `.plans/` with `.prompts.md` companions.
- <https://github.com/bevry-vibes/skills/blob/main/policy.md> — **applies**. Run `agent-detect check-reciprocal` fresh for each session; record the verdict here.
- <https://github.com/bevry-vibes/skills/blob/main/license.md> — once-off initialisation is done (`LICENSE.md`, RPL-1.5, copyright Benjamin Lupton per `git config user.name`).
- <https://github.com/bevry-vibes/skills/blob/main/build.md> — does not apply. This project is a test harness, not a menu-bar or tray desktop application.
- <https://github.com/bevry-vibes/skills/blob/main/powershell.md> — does not apply. This project targets Linux (Fedora) and Cloudflare Workers; no PowerShell tooling.
- <https://github.com/bevry-vibes/skills/blob/main/zig.md> — does not apply. No Zig in this project.
- <https://github.com/bevry-vibes/skills/blob/main/minimax.md> — does not apply. MiniMax model tweaks are not relevant to this harness.

## Layout

| Path | Purpose |
| --- | --- |
| `models/<name>/` | One self-contained test per model: `package.json`, `wrangler.jsonc`, `src/worker.js`, optional `assets/`, `RESULTS.md` |
| `docs/models.md` | Inventory of every Desert Ant model, its SDK platforms, and weight formats |
| `docs/results.md` | Combined results table across all models |
| `scripts/` | Shared helper scripts, for example weight fetching |

## Commands

```bash
npm install        # install wrangler at the repository root
npm test           # run every model test that defines a test script
```

Run one model in isolation:

```bash
cd models/<name>
npm install        # per-model dependencies
npx wrangler dev   # then open the routes the model README lists
```

## Rules

- Model weights are fetched, never committed. The root `.gitignore` excludes `models/*/assets/*` weight formats.
- Each model keeps its own `package.json`, so dependency installs stay isolated and parallel.
- Write all content in Simplified Technical English with International English spelling. See the conventions skill.
