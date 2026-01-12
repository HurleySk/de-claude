# de-claude

Remove Claude co-authorship attribution from unpushed git commits.

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
--range <range>    Explicit commit range (e.g., HEAD~5..HEAD)
-h, --help         Display help
-V, --version      Display version
```

### Examples

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

Only process specific commits:
```bash
de-claude --range HEAD~3..HEAD
```

## What it removes

- `Co-Authored-By` lines containing "Claude" or "@anthropic.com"
- `🤖 Generated with [Claude Code]` lines

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

The tool uses `git filter-branch` to rewrite commit messages. It automatically detects:

- **Tracking branch**: Compares against your upstream (e.g., `origin/main`)
- **Feature branches**: Finds commits since branching from main/master
- **Local-only repos**: Processes all commits on the current branch

## Requirements

- Node.js 18+
- Git

## License

MIT
