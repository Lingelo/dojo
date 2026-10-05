# Notifications System plugin

System sounds and OS notifications when Claude finishes a task or needs your attention.

> **Migration**: this plugin used to be called `notifications`. If you had
> `notifications@angelo-plugins` installed, uninstall it and reinstall it under the new name:
> ```bash
> /plugin install notifications-system@angelo-plugins
> ```

## Installation

```bash
/plugin install notifications-system@angelo-plugins
```

Prerequisite: Node.js. On Linux, see [Linux dependencies](#linux-installing-the-dependencies).

## Features

| Event | Sound | Notification | When |
|---|---|---|---|
| **Stop** | completion sound | "Task complete" | Claude finishes a response |
| **Notification** (`permission_prompt`) | attention sound | "Action required" | Claude asks for an interaction (tool permission, interactive question, form) |

> **Note**: the attention sound does not fire after 60 s of inactivity (`idle_prompt`), only on active
> interactions.

## Configuration

Both channels are on by default. Configuration is read on every notification: no need to restart Claude
Code.

### Configuration file

Create `~/.claude/config/notifications.json`:

```bash
mkdir -p ~/.claude/config
```

```json
{
  "sound": true,
  "visual": true
}
```

| Mode | sound | visual |
|---|---|---|
| Sound + visual (default) | `true` | `true` |
| Visual only | `false` | `true` |
| Sound only | `true` | `false` |
| Off | `false` | `false` |

Quick commands:

```bash
# Visual only (no sound)
echo '{"sound": false, "visual": true}' > ~/.claude/config/notifications.json

# Sound only (no visual notification)
echo '{"sound": true, "visual": false}' > ~/.claude/config/notifications.json

# Both (default)
echo '{"sound": true, "visual": true}' > ~/.claude/config/notifications.json
```

### Environment variables

When a key is missing from the file, the environment variables are used:

| Variable | Values | Default |
|---|---|---|
| `CLAUDE_NOTIFY_SOUND` | `true` / `false` | `true` |
| `CLAUDE_NOTIFY_VISUAL` | `true` / `false` | `true` |

Precedence: file > environment variables > defaults.

## Compatibility

| OS | Sound | Visual notification |
|---|---|---|
| **macOS** | `afplay` (built in) | `osascript` (built in) |
| **Linux** | `paplay`, then `aplay` | `notify-send` (libnotify) |
| **Windows** | PowerShell `System.Media.SystemSounds` | PowerShell toast |

### macOS

Uses the system sounds:
- Completion: `/System/Library/Sounds/Glass.aiff`
- Attention: `/System/Library/Sounds/Ping.aiff`

### Linux

Looks for sounds in this order:
1. `/usr/share/sounds/freedesktop/stereo/complete.oga` (completion) or `bell.oga` (attention)
2. `/usr/share/sounds/sound-icons/prompt.wav`
3. `/usr/share/sounds/ubuntu/stereo/message.ogg`
4. `/usr/share/sounds/gnome/default/alerts/drip.ogg`
5. Fallback: terminal bell (`\x07`)

### Windows

Uses PowerShell with `System.Media.SystemSounds`:
- Completion: `Asterisk`
- Attention: `Exclamation`

## Why this plugin?

When Claude works on long tasks, you can do something else and be notified when:
- Claude has finished its work;
- Claude asks for a permission or asks an interactive question.

No more watching the terminal all the time.

## Structure

```
notifications-system/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── scripts/
│   ├── notify.js          # sound + visual notification
│   └── install-deps.sh    # Linux dependencies
└── README.md
```

## Troubleshooting

### No sound on macOS

Check that the volume is not at zero and that system sounds are enabled in System Settings > Sound.

### Linux: installing the dependencies

An installation script is provided for the main distributions:

```bash
# From the plugin folder
./scripts/install-deps.sh
```

The script detects your distribution (Debian/Ubuntu, Fedora/RHEL, Arch, openSUSE) and installs:
- `libnotify` — for visual notifications (`notify-send`)
- `pulseaudio-utils` — for sound (`paplay`)

### No sound on Windows

Check that PowerShell is available and that system sounds are enabled.

### No notification at all

- Check that the plugin is enabled (`/plugin`).
- Check `~/.claude/config/notifications.json` is valid JSON (an invalid file is ignored and the defaults
  apply).
