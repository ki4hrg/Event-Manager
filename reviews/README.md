# reviews/

Multi-pass review processes for keeping the project aligned with itself. Each subdirectory is one self-contained process — its own `prompts/` and the artifacts those prompts produce.

## Processes

| Directory | Purpose |
|---|---|
| [`claudemd/`](claudemd/prompts/README.md) | Reverse-engineer conventions from the code, diff against `CLAUDE.md`, and produce a corrected version. |
| [`subagents/`](subagents/prompts/) | Comprehensive review of the project's subagent definitions. |

## Conventions

- Each process has a `prompts/` subdirectory with numbered, self-contained prompts. Run each in a clean context so earlier passes don't bias later ones.
- Output artifacts live alongside `prompts/` in the same process directory (no `claudemd-` / `subagents-` filename prefixes — the directory provides the context).
- Each process's `prompts/README.md` documents its own orchestration.
