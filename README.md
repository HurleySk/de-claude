# de-claude

Remove Claude co-authorship attribution from git commits.

## Installation

```bash
npm install -g de-claude
```

## Usage

Run in any git repository:

```bash
de-claude
```

This will:
1. Find all unpushed commits with Claude attribution
2. Show a preview of commits to be cleaned
3. Ask for confirmation
4. Remove the attribution lines and rewrite history

### Options

```
--dry-run          Show what would happen without making changes
-y, --yes          Skip confirmation prompt
--verbose          Show actual lines being removed
--last <n>         Process only the last N commits (first-parent only)
--all              Process all commits on the current branch
--range <range>    Explicit git commit range (e.g., HEAD~5..HEAD)
--remote           Rewrite already-pushed commits (requires --last, --all, or --range; force-pushes)
-h, --help         Display help
-V, --version      Display version
```

`--last`, `--all`, and `--range` are mutually exclusive.

### Selecting which commits to process

By default, de-claude auto-detects unpushed commits by comparing against your tracking branch. You can override this:

**Last N commits** (recommended for most cases):
```bash
de-claude --last 3
```

`--last` follows only the first-parent line, so merge commits count as one commit. `--last 5` always processes exactly 5 commits regardless of merge history.

**All commits on the branch:**
```bash
de-claude --all
```

**Explicit git range** (for advanced usage):
```bash
de-claude --range HEAD~10..HEAD
de-claude --range origin/main..HEAD
```

Note: `--range` does not use `--first-parent`, so ranges that include merge commits may process more commits than expected.

### Cleaning already-pushed commits

To rewrite commits that have already been pushed to the remote, add `--remote`. This will force-push after rewriting:

```bash
de-claude --remote --last 10
de-claude --remote --all
de-claude --remote --range abc1234..HEAD
```

`--remote` always requires confirmation, even with `--yes`, because force-pushing rewrites published history.

### Other examples

Preview changes without applying them:
```bash
de-claude --dry-run
```

See exactly which lines will be removed:
```bash
de-claude --dry-run --verbose
```

Skip confirmation (useful for scripts):
```bash
de-claude --yes
```

## What it removes

- `Co-Authored-By` lines containing "Claude" or "@anthropic.com"
- `Generated with [Claude Code]` lines

### Before

```
feat: Add user authentication

Implemented JWT-based auth flow with refresh tokens.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### After

```
feat: Add user authentication

Implemented JWT-based auth flow with refresh tokens.
```

## How it works

The tool uses `git filter-branch` to rewrite commit messages. It only rewrites commits starting from the oldest affected commit, minimizing unnecessary history changes.

### Auto-detection (no flags)

When run without `--last`, `--all`, or `--range`, de-claude automatically determines which commits to scan:

1. **Tracking branch exists** (e.g., `origin/main`): scans only unpushed commits
2. **Feature branch**: scans commits since branching from main/master
3. **No remote**: scans all commits on the current branch

### History rewriting

Changing a commit message changes its SHA. Every descendant commit also gets a new SHA because its parent changed. This is inherent to git — de-claude minimizes the blast radius by starting the rewrite from the oldest affected commit, not the full scan range.

## Requirements

- Node.js 18+
- Git

## License

MIT
