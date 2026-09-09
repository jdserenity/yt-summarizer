---
name: logical-commits
description: >-
  Split current work into a trail of small, coherent git commits.
  Use only when the user explicitly asks to create logical commits or
  invokes the logical commit skill.
---

# Logical commits

When this skill is invoked, turn the current uncommitted work into a sequence of logical commits. Do not push.

## What counts as one commit

Each commit is one coherent unit of work — something you can describe in one short message (e.g. "add user model", "wire login route to session", "add tests for login validation"). A multi-step feature usually becomes several commits; how many depends on the work, not a fixed count.

Prefer commits that leave the repo in a sensible state (tests passing for what that commit adds). Avoid half-wired broken middles unless you truly cannot avoid them. Prefer coherent chunks over both mega-commits and meaningless one-line typo commits.

Buildability is not a reason to collapse independent work into one commit. Order commits from foundations to consumers, and place each behavior's tests in the same commit as that behavior. A repository may gain capabilities incrementally even when the final entrypoint arrives later.

## Decomposition guardrails

Before staging anything, inventory the changed files by concern and write a commit plan. Typical concerns include project foundation, data model, domain behavior, each external integration, orchestration, user interface, operations, and documentation. If two groups can be reviewed or reverted independently, they normally belong in different commits.

Never put an entire new application into one implementation commit when storage, domain logic, external integrations, orchestration, and UI can be separated. "The app only works when everything is present" does not make those changes one concern.

Use these checks to catch under-splitting:

- Exclude lockfiles and generated files when judging change size, but commit them alongside the configuration that generated them.
- If a proposed commit adds more than roughly 500 non-generated lines or crosses more than one architectural layer, pause and identify the single behavior it owns. Split it unless every file is necessary to review that one behavior.
- If the subject needs a vague umbrella such as "build the application" or joins multiple outcomes with "and", the commit is probably too broad.
- A large greenfield change should usually produce a sequence of foundational and feature commits, not one implementation commit plus one documentation commit.

Do not turn these heuristics into arbitrary micro-commits. Closely coupled implementation and tests are one unit; unrelated formatting or documentation is not.

## Commit messages

Write complete sentences: a short subject stating what changed and why it matters (focus on "why" over "what").

## How to run

1. Inspect the full working tree (`git status`, `git diff`, recent `git log` for message style).
2. Separate generated-file volume from authored changes, inventory the authored changes by concern, and state the commit plan before staging.
3. Challenge the plan with the decomposition guardrails above. Revise any umbrella commit before creating it.
4. Stage and commit one unit at a time. Inspect `git diff --cached --stat` before committing.
5. After each commit, inspect its file list, confirm the message matches that unit only, and run the smallest relevant test or build check.
6. At the end, run the full relevant verification suite and inspect the final log and working tree.
7. Stop when the working tree is clean (or only unrelated leftover files remain). Report the commits you created. Never push unless the user explicitly asks.
