# Statusline plugin v2.1.0

An advanced statusline for Claude Code, based on [hell0github/claude-statusline](https://github.com/hell0github/claude-statusline).

## Overview

```
marketplace | 140k/168k [████████░░] | $19/$140 [███░░░│░░░] 13% | 16:46/18:00 (2h 13m) | 235/min | ×1
```

**Sections:**
- **Project**: folder name (orange)
- **Context**: `140k/168k [bar]` - tokens used/limit
- **5h window**: `$19/$140 [bar│] 13%` - cost/limit with projection (│)
- **Timer**: `16:46/18:00 (2h 13m)` - current time/reset (countdown, 24h format)
- **Burn rate**: `235/min` - tokens/minute
- **Sessions**: `×1` - active Claude Code sessions

## Supported modes

| Mode | Description | Sections shown |
|---|---|---|
| `api` | Pay-as-you-go / API usage | Context, burn rate, sessions |
| `pro` | Claude Pro ($20/month) | All configurable sections |
| `max5x` | Claude Max 5x ($100/month) | All configurable sections |
| `max20x` | Claude Max 20x ($200/month) | All configurable sections |

## Features

- **API usage support**: a mode without cost limits for pay-as-you-go users
- **Automatic cleanup**: the previous installation is removed before setup
- **Multi-period tracking**: context, 5h window, daily, weekly, monthly
- **Multi-layer bars**: 3 levels (green/orange/red) with configurable thresholds
- **Smart projection**: a `│` separator showing the burn-rate projection
- **Timer**: countdown to the reset of the 5-hour block
- **Token burn rate**: tokens/minute in real time
- **Active sessions**: number of open Claude Code projects
- **Smart caching**: avoids excessive calls to ccusage
- **macOS fix**: `date -d` patched to `gdate -d` automatically
- **Time format**: 24h (recommended) or 12h, chosen during setup

## Compatibility

- **macOS** (Intel and Apple Silicon)
- **Linux** (Ubuntu, Debian, etc.)
- **Windows WSL** (Windows Subsystem for Linux)

## Prerequisites

### Required

- **jq**: `brew install jq` (macOS) | `apt install jq` (Linux/WSL)
- **git**: to clone the repo
- **coreutils** on macOS (`gdate`): `brew install coreutils` — installed by the skill if missing

### Recommended

- **ccusage**: `npm install -g ccusage` - for cost tracking
- **bash 4+**: `brew install bash` on macOS

## Installation

### Through the skill (recommended)

```
/statusline-setup
```

The skill runs 11 phases:
1. **Cleans up** the existing installation (shim, repo, `statusLine` in settings)
2. **Checks and installs** the prerequisites (jq, ccusage, git, gdate on macOS)
3. **Asks** for the billing mode (API usage or subscription)
4. **Clones** the repo into `~/Projects/cc-statusline`
5. **Patches** macOS (`date -d` → `gdate -d`)
6. **Asks** for the time format (24h / 12h)
7. **Configures** the sections, the weekly mode and monthly tracking for your plan
8. **Creates** the shim in `~/.claude/statusline.sh`
9. **Configures** `~/.claude/settings.json`
10. **Tests** the installation
11. **Confirms** and explains how to read the statusline

### Manual installation

```bash
# 1. Clean up (if it exists)
rm -f ~/.claude/statusline.sh
rm -rf ~/Projects/cc-statusline

# 2. Clone the repo
git clone https://github.com/hell0github/claude-statusline.git ~/Projects/cc-statusline

# 3. Copy and configure
cp ~/Projects/cc-statusline/config/config.example.json ~/Projects/cc-statusline/config/config.json
# Edit config.json (plan, sections, etc.)

# 4. Create the data folder
mkdir -p ~/Projects/cc-statusline/data

# 5. Create the shim
cat > ~/.claude/statusline.sh << 'EOF'
#!/bin/bash
exec "$HOME/Projects/cc-statusline/src/statusline.sh" "$@"
EOF
chmod +x ~/.claude/statusline.sh

# 6. Configure settings.json
# Add to ~/.claude/settings.json:
# "statusLine": {
#   "type": "command",
#   "command": "~/.claude/statusline.sh",
#   "padding": 0
# }

# 7. Restart Claude Code
```

On macOS, also apply the `gdate` patch (see [Troubleshooting](#error-in-statuslinesh-on-macos)).

## Configuration

The config file is `~/Projects/cc-statusline/config/config.json`.

### Plan

```json
{
  "user": {
    "plan": "max5x"
  }
}
```

Options: `pro`, `max5x`, `max20x`

**Note**: for the API usage mode, use `max20x` but turn the cost sections off.

### Sections

```json
{
  "sections": {
    "show_directory": true,
    "show_context": true,
    "show_five_hour_window": true,
    "show_daily": true,
    "show_weekly": true,
    "show_monthly": false,
    "show_timer": true,
    "show_token_rate": true,
    "show_sessions": true,
    "weekly_display_mode": "recommend"
  }
}
```

### API mode configuration (pay-as-you-go)

For API usage users without limits:

```json
{
  "user": {
    "plan": "max20x"
  },
  "sections": {
    "show_directory": true,
    "show_context": true,
    "show_five_hour_window": false,
    "show_daily": false,
    "show_weekly": false,
    "show_monthly": false,
    "show_timer": false,
    "show_token_rate": true,
    "show_sessions": true
  }
}
```

### Weekly display modes

- `usage`: shows the weekly usage %
- `avail`: shows the remaining available %
- `recommend`: shows the recommended daily %

### Tracking (for accurate daily/weekly)

To sync with Anthropic's official reset:

```json
{
  "tracking": {
    "weekly_scheme": "ccusage_r",
    "official_reset_date": "2025-01-29T15:00:00-08:00"
  }
}
```

Find the reset date: [console.anthropic.com](https://console.anthropic.com) > Usage > "Resets [date/time]"

### Monthly (optional)

```json
{
  "sections": {
    "show_monthly": true
  },
  "tracking": {
    "payment_cycle_start_date": "2025-01-01T15:00:00-08:00"
  }
}
```

### Weekly limits used for the percentages

| Plan | Weekly limit | Tokens/5h |
|---|---|---|
| `pro` | $300/week | 19K |
| `max5x` | $500/week | 88K |
| `max20x` | $850/week | 220K |
| `api` | none | pay-as-you-go |

The statusline estimates cost locally with ccusage from the transcripts (`~/.claude/projects/`), Claude
Code only; `/status` shows the official server-side usage, which may include web/mobile. A gap between
the two is normal.

## Architecture

### Shim pattern

```
Claude Code → ~/.claude/statusline.sh (2-line shim)
                        ↓
              ~/Projects/cc-statusline/src/statusline.sh (implementation)
```

**Benefits:**
- stable interface (Claude Code always calls the same path);
- easy update (`git pull` in the repo);
- code reusable across projects.

### Repo structure

```
~/Projects/cc-statusline/
├── src/
│   ├── statusline.sh         # Main script (3-stage pipeline)
│   ├── statusline-utils.sh   # Period calculations
│   ├── statusline-layers.sh  # Multi-layer calculations
│   └── statusline-cache.sh   # Cache management
├── config/
│   ├── config.json           # Your config (gitignored)
│   └── config.example.json   # Template
├── data/                     # Cache (gitignored)
└── tools/
    └── calibrate_weekly_usage.sh
```

## Updating

```bash
cd ~/Projects/cc-statusline
git pull
```

A `git pull` overwrites the macOS and 24h patches: apply them again, or run `/statusline-setup` again.

## Behavior

### Refresh

The statusline **is not shown in real time**. It only updates on events:
- submitting a message;
- receiving a response;
- other interactions with Claude Code.

**Normal behaviors:**
- no statusline right at startup — it appears after the first interaction;
- no update while typing — it refreshes on submission.

This is Claude Code's standard behavior, not a bug.

## Troubleshooting

### The statusline does not show

```bash
# Check the shim
ls -la ~/.claude/statusline.sh

# Test manually
echo '{"workspace":{"current_dir":"~"},"transcript_path":""}' | ~/.claude/statusline.sh
```

### "ERROR in statusline.sh" on macOS

The source repo uses `date -d` (GNU). Install coreutils and patch:

```bash
brew install coreutils
sed -i '' 's/date -d/gdate -d/g' ~/Projects/cc-statusline/src/statusline-utils.sh
sed -i '' 's/date -d/gdate -d/g' ~/Projects/cc-statusline/src/statusline.sh
```

### Config validation error

Check that:
- `user.plan` is set (`pro`, `max5x`, `max20x`);
- if `show_monthly: true`, `payment_cycle_start_date` is set;
- if `weekly_scheme: ccusage_r`, `official_reset_date` is set.

### Gap with the Anthropic console

Use the calibration tool:
```bash
~/Projects/cc-statusline/tools/calibrate_weekly_usage.sh 18.5
```

Or set `tracking.weekly_baseline_percent` in config.json.

### Full reinstall

Run `/statusline-setup` - the automatic cleanup removes the previous installation.

## Changelog

### v2.1.0
- **New**: API usage mode (pay-as-you-go)
- **New**: automatic cleanup of the existing installation
- **New**: command converted to a skill for better guidance
- **Improved**: simpler detection and configuration

### v2.0.0
- Moved to [hell0github/claude-statusline](https://github.com/hell0github/claude-statusline)
- Shim pattern for easy updates
- Multi-period support (daily, weekly, monthly)

## Sources

- [hell0github/claude-statusline](https://github.com/hell0github/claude-statusline)
- [ccusage - npm](https://www.npmjs.com/package/ccusage)
- [Claude Code statusline docs](https://code.claude.com/docs/en/statusline)
