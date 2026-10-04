---
name: statusline-setup
description: Configures and installs the Claude Code statusline (cost, context, 5-hour window, burn rate, sessions). Use when the user asks to install, configure or set up the statusline, says /statusline-setup, or wants a status line.
allowed-tools: Bash, Read, Edit, Write, Glob, AskUserQuestion
---

# Statusline setup v2.1.0

Configures the Claude Code statusline based on [hell0github/claude-statusline](https://github.com/hell0github/claude-statusline).

Talk to the user in their language; the commands and messages below are given in English.

## Overview

```
marketplace | 140k/168k [████████░░] | $19/$140 [███░░░│░░░] 13% | 16:46/18:00 | 235/min | ×1
     │              │                      │                          │            │       │
     │              │                      │                          │            │       └─ Active sessions
     │              │                      │                          │            └─ Burn rate (tokens/min)
     │              │                      │                          └─ Current time / 5-hour window reset
     │              │                      └─ 5-hour window: cost / limit, % used
     │              └─ Context window: tokens / limit (168K)
     └─ Project name
```

## Known bugs and fixes

### macOS: `date -d` error

The source repo uses `date -d` (GNU/Linux syntax), which does not exist on macOS.

**Automatic fix**: the skill installs `coreutils` through Homebrew and patches the scripts to use `gdate`.

### show_monthly requires payment_cycle_start_date

If `show_monthly: true`, the `tracking.payment_cycle_start_date` field is required.

**Fix**: the skill asks for the cycle start date if the user turns monthly tracking on.

### `sed -i ''` on Linux

The `sed -i ''` commands below are the macOS (BSD) syntax. On Linux, use `sed -i` without `''`.

## Instructions

### Phase 1: Clean up the existing installation

**REQUIRED**: always clean up before installing, to avoid conflicts.

```bash
echo "=== Cleaning up the existing statusline ===" && \
rm -f ~/.claude/statusline.sh 2>/dev/null && echo "  Shim removed" || true && \
rm -rf ~/Projects/cc-statusline 2>/dev/null && echo "  Repo removed" || true && \
echo "=== Cleanup done ==="
```

Then read `~/.claude/settings.json` and **remove the `statusLine` section** if it exists.

### Phase 2: Check and install the prerequisites

```bash
echo "=== Checking prerequisites ===" && \
echo "OS: $(uname -s)" && \
echo "jq: $(which jq > /dev/null 2>&1 && echo '✅' || echo '❌ REQUIRED')" && \
echo "ccusage: $(which ccusage > /dev/null 2>&1 && echo '✅' || echo '⚠️ Recommended')" && \
echo "git: $(which git > /dev/null 2>&1 && echo '✅' || echo '❌ REQUIRED')" && \
if [ "$(uname -s)" = "Darwin" ]; then
  echo "gdate: $(which gdate > /dev/null 2>&1 && echo '✅' || echo '❌ REQUIRED on macOS')"
fi
```

**Automatic installation of missing prerequisites:**

If `jq` is missing:
```bash
# macOS
brew install jq
# Linux
sudo apt install jq
```

If `ccusage` is missing (recommended but optional):
```bash
npm install -g ccusage
```

**On macOS, if `gdate` is missing, install coreutils automatically:**
```bash
if [ "$(uname -s)" = "Darwin" ] && ! which gdate > /dev/null 2>&1; then
  echo "Installing coreutils (gdate)..."
  brew install coreutils
fi
```

### Phase 3: Choose the billing mode

Use AskUserQuestion:

| Option | Description |
|---|---|
| `api` | Pay-as-you-go / API usage - no weekly limit |
| `max20x` | Claude Max 20x - $200/month, 220K tokens/5h, $850/week |
| `max5x` | Claude Max 5x - $100/month, 88K tokens/5h, $500/week |
| `pro` | Claude Pro - $20/month, 19K tokens/5h, $300/week |

### Phase 4: Install

```bash
mkdir -p ~/Projects && \
git clone https://github.com/hell0github/claude-statusline.git ~/Projects/cc-statusline && \
mkdir -p ~/Projects/cc-statusline/data && \
cp ~/Projects/cc-statusline/config/config.example.json ~/Projects/cc-statusline/config/config.json && \
echo "✅ Repo cloned into ~/Projects/cc-statusline"
```

### Phase 5: macOS patch (if Darwin)

**IMPORTANT**: this phase is required on macOS to fix the `date -d` bug.

Check whether we are on macOS and apply the patch automatically:

```bash
if [ "$(uname -s)" = "Darwin" ]; then
  sed -i '' 's/date -d/gdate -d/g' ~/Projects/cc-statusline/src/statusline-utils.sh
  sed -i '' 's/date -d/gdate -d/g' ~/Projects/cc-statusline/src/statusline.sh
  echo "✅ macOS patch applied (date -> gdate)"
fi
```

Check that the patch was applied:
```bash
grep -c "gdate -d" ~/Projects/cc-statusline/src/statusline-utils.sh
# Should return 8
```

### Phase 6: Choose the time format

Use AskUserQuestion:

| Option | Example | Description |
|---|---|---|
| `24h` (Recommended) | 17:30/18:00 | 24-hour format |
| `12h` | 5:30PM/6PM | 12-hour format with AM/PM |

**Apply the patch matching the choice:**

If the user picks **24h**, apply this patch:

```bash
# 24h patch for CURRENT_TIME
sed -i '' 's/date "+%-l:%M%p"/date "+%H:%M"/g' ~/Projects/cc-statusline/src/statusline.sh
sed -i '' 's/date "+%I:%M%p"/date "+%H:%M"/g' ~/Projects/cc-statusline/src/statusline.sh

# 24h patch for RESET_TIME (gdate on macOS)
sed -i '' 's/"+%-l%p"/"+%H:%M"/g' ~/Projects/cc-statusline/src/statusline.sh

echo "✅ 24h format applied"
```

If the user picks **12h**, do nothing (it is the default format).

### Phase 7: Configure for the mode

Read and edit `~/Projects/cc-statusline/config/config.json`:

#### API mode (pay-as-you-go)

Change these fields:
- `user.plan`: keep `"max20x"` (placeholder value, no limits)
- `sections.show_five_hour_window`: `false`
- `sections.show_daily`: `false`
- `sections.show_weekly`: `false`
- `sections.show_monthly`: `false`
- `sections.show_timer`: `false`

#### Subscription modes (pro, max5x, max20x)

Ask for the preferences with AskUserQuestion:

**Question 1 - Sections to show:**
- "Recommended": Context + 5h window + Weekly + Timer + Burn rate + Sessions
- "Full": all sections including Monthly
- "Minimal": Context + Burn rate only

**Question 2 - Weekly display mode:**
- `recommend`: recommended daily % [Recommended]
- `usage`: weekly usage %
- `avail`: remaining available %

**Question 3 - Monthly tracking (if "Full" or explicitly asked):**
- "Yes": turn monthly cost tracking on
- "No": turn it off (default)

**If monthly tracking is on**, ask for the billing cycle start date with AskUserQuestion:

Predefined options:
- "The 1st of the month": the cycle starts on the 1st
- "The 15th of the month": the cycle starts on the 15th
- "Turn monthly off": do not turn monthly tracking on

The user can also pick "Other" to type a custom day (e.g. "the 28th", "7", "23").

**Building the ISO date** from the chosen day:
- Take the day of the month (1-31)
- Build the date with the current month and the local timezone
- Format: `YYYY-MM-DDTHH:MM:SS-HH:MM`

Example:
```bash
# If the user says "the 28th" or picks the 28th
# Build: 2025-01-28T00:00:00-08:00

# Get the local timezone
TZ_OFFSET=$(date +%z | sed 's/\(..\)$/:\1/')
# E.g. -08:00 for PST
```

Edit `~/Projects/cc-statusline/config/config.json`:

1. Set `user.plan` to the chosen plan (`pro`, `max5x` or `max20x`)

2. Configure the sections according to the choice

3. Configure `weekly_display_mode` according to the choice

4. **If monthly tracking is on**:
   - Set `sections.show_monthly: true`
   - Set `tracking.payment_cycle_start_date` to the ISO date

   Example:
   ```json
   {
     "sections": {
       "show_monthly": true
     },
     "tracking": {
       "payment_cycle_start_date": "2025-01-01T00:00:00-08:00"
     }
   }
   ```

### Phase 8: Create the shim

```bash
cat > ~/.claude/statusline.sh << 'EOF'
#!/bin/bash
exec "$HOME/Projects/cc-statusline/src/statusline.sh" "$@"
EOF
chmod +x ~/.claude/statusline.sh && \
echo "✅ Shim created in ~/.claude/statusline.sh"
```

### Phase 9: Configure settings.json

Read `~/.claude/settings.json` and add/check the `statusLine` section:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh",
    "padding": 0
  }
}
```

### Phase 10: Test

```bash
echo '{"workspace":{"current_dir":"~"},"transcript_path":""}' | ~/.claude/statusline.sh
```

**If the test fails with "ERROR in statusline.sh"**:
- On macOS: check that the gdate patch was applied (Phase 5)
- Check that `gdate` is installed (`brew install coreutils`)

**If the test fails with "Configuration validation failed"**:
- Read the error message and fix config.json accordingly
- If "payment_cycle_start_date is required": set `show_monthly: false`

### Phase 11: Confirmation

Show this summary:

```
✅ Statusline v2.1.0 configured!

Mode: <api | pro | max5x | max20x>
Active sections: <list>
Weekly mode: <recommend | usage | avail>
Time format: <24h | 12h>
<If monthly is on: Cycle since <date>>
<If macOS: gdate patch applied ✅>

Files:
- Config: ~/Projects/cc-statusline/config/config.json
- Shim: ~/.claude/statusline.sh

⚠️ Restart Claude Code to apply.
```

**Then show the guide to reading the statusline:**

```
📊 Reading the statusline:

Example: marketplace | 140k/168k [████░░] | $15/$140 [██│░░░] 10% | weekly 77% | total $135 | 17:26/19:00 (1h 33m) | 56/min | ×2

┌─────────────────────┬────────────────────────────────────────────────────────┐
│ Segment             │ Meaning                                                │
├─────────────────────┼────────────────────────────────────────────────────────┤
│ marketplace         │ Project name (current folder)                          │
│ 140k/168k [████░░]  │ Context window: tokens used / limit (168K)             │
│ $15/$140 [██│░░] 10%│ 5-hour window: current cost / limit, % of the limit    │
│ weekly 77%          │ Weekly usage (usage mode)                              │
│   or recom 14%      │ Recommended daily % to finish the budget (recommend)   │
│   or avail 23%      │ Remaining % available this week (avail mode)           │
│ total $135          │ Total cost of the month (since the cycle date)         │
│ 17:26/19:00 (1h 33m)│ Current time / 5h reset, time left                     │
│ 56/min              │ Burn rate: tokens consumed per minute                  │
│ ×2                  │ Number of active Claude Code sessions                  │
└─────────────────────┴────────────────────────────────────────────────────────┘

Colors:
- Green: normal usage
- Orange: careful, approaching the limits
- Red: limit reached or exceeded
```

```
⚠️ Difference between the statusline and the Claude interface (/status):

┌─────────────────────┬─────────────────────────────────────────────────────────┐
│ Source              │ What it measures                                        │
├─────────────────────┼─────────────────────────────────────────────────────────┤
│ Claude interface    │ Real API usage measured by Anthropic (server)           │
│ (/status)           │ = official data, may include web/mobile usage           │
├─────────────────────┼─────────────────────────────────────────────────────────┤
│ Statusline          │ Cost estimated locally by ccusage from the              │
│ (ccusage)           │ transcripts (~/.claude/projects/)                       │
│                     │ = Claude Code only, not web/mobile                      │
└─────────────────────┴─────────────────────────────────────────────────────────┘

Weekly % in the statusline: estimated_cost / plan_weekly_limit

Weekly limits per plan:
┌──────────┬──────────────┬─────────────────┬─────────────────────────────────┐
│ Plan     │ Weekly limit │ Tokens/5h       │ Example                         │
├──────────┼──────────────┼─────────────────┼─────────────────────────────────┤
│ pro      │ $300/week    │ 19K tokens/5h   │ $150 spent = 50% weekly         │
│ max5x    │ $500/week    │ 88K tokens/5h   │ $390 spent = 78% weekly         │
│ max20x   │ $850/week    │ 220K tokens/5h  │ $425 spent = 50% weekly         │
│ api      │ No limit     │ Pay-as-you-go   │ weekly off                      │
└──────────┴──────────────┴─────────────────┴─────────────────────────────────┘

Note: a gap between the two sources is normal (different calculation methods).
```

```
Useful commands:
- Edit the config: edit ~/Projects/cc-statusline/config/config.json
- Update: cd ~/Projects/cc-statusline && git pull
- Reconfigure: ask "install the statusline"
```

## Troubleshooting

### "gdate: command not found" on macOS

Install coreutils:
```bash
brew install coreutils
```

### "ERROR in statusline.sh" on macOS after the patch

Check that the patch was applied:
```bash
grep "gdate -d" ~/Projects/cc-statusline/src/statusline-utils.sh
```

If there is no result, apply the patch again:
```bash
sed -i '' 's/date -d/gdate -d/g' ~/Projects/cc-statusline/src/statusline-utils.sh
sed -i '' 's/date -d/gdate -d/g' ~/Projects/cc-statusline/src/statusline.sh
```

### "payment_cycle_start_date is required"

Set `show_monthly: false` in config.json.

### The statusline does not show

```bash
ls -la ~/.claude/statusline.sh
cat ~/.claude/settings.json | jq '.statusLine'
echo '{"workspace":{"current_dir":"~"},"transcript_path":""}' | ~/.claude/statusline.sh
```

### Changing the time format after installation

To switch to 24h:
```bash
sed -i '' 's/date "+%-l:%M%p"/date "+%H:%M"/g' ~/Projects/cc-statusline/src/statusline.sh
sed -i '' 's/date "+%I:%M%p"/date "+%H:%M"/g' ~/Projects/cc-statusline/src/statusline.sh
sed -i '' 's/"+%-l%p"/"+%H:%M"/g' ~/Projects/cc-statusline/src/statusline.sh
```

To go back to 12h (AM/PM), reinstall the repo and apply the patches again.

### Reinstalling

Run this skill again - cleanup is automatic in Phase 1.

### Updating the repo (mind the patches)

After a `git pull`, the macOS and time format patches are overwritten. Apply them again:
```bash
cd ~/Projects/cc-statusline
git pull

# Apply the macOS patch again if Darwin
if [ "$(uname -s)" = "Darwin" ]; then
  sed -i '' 's/date -d/gdate -d/g' src/statusline-utils.sh
  sed -i '' 's/date -d/gdate -d/g' src/statusline.sh
fi

# Apply the 24h patch again if wanted
sed -i '' 's/date "+%-l:%M%p"/date "+%H:%M"/g' src/statusline.sh
sed -i '' 's/date "+%I:%M%p"/date "+%H:%M"/g' src/statusline.sh
sed -i '' 's/"+%-l%p"/"+%H:%M"/g' src/statusline.sh
```
