#!/usr/bin/env node

/**
 * Claude Code Notification Sound Player
 * Plays system sounds when Claude completes tasks or needs attention.
 *
 * Supports: macOS, Linux, Windows
 *
 * Usage:
 *   - Stop hook: plays "complete" sound
 *   - Notification hook: plays "attention" sound
 *
 * Configuration (environment variables):
 *   - CLAUDE_NOTIFY_SOUND=true|false   (default: true)
 *   - CLAUDE_NOTIFY_VISUAL=true|false  (default: true)
 */

// Configuration: file > env > defaults
function loadConfig() {
  const configPath = require('path').join(
    process.env.HOME || process.env.USERPROFILE,
    '.claude', 'config', 'notifications.json'
  );

  let fileConfig = {};
  try {
    if (require('fs').existsSync(configPath)) {
      fileConfig = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
    }
  } catch {
    // Ignore parse errors
  }

  return {
    sound: fileConfig.sound ?? (process.env.CLAUDE_NOTIFY_SOUND !== 'false'),
    visual: fileConfig.visual ?? (process.env.CLAUDE_NOTIFY_VISUAL !== 'false')
  };
}

const CONFIG = loadConfig();

const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Sound configurations per OS
const SOUNDS = {
  darwin: {
    complete: '/System/Library/Sounds/Glass.aiff',
    attention: '/System/Library/Sounds/Ping.aiff'
  },
  linux: {
    complete: '/usr/share/sounds/freedesktop/stereo/complete.oga',
    attention: '/usr/share/sounds/freedesktop/stereo/bell.oga'
  }
};

// Fallback Linux sounds
const LINUX_FALLBACK_SOUNDS = [
  '/usr/share/sounds/sound-icons/prompt.wav',
  '/usr/share/sounds/ubuntu/stereo/message.ogg',
  '/usr/share/sounds/gnome/default/alerts/drip.ogg'
];

function getHookType() {
  // Check environment variable set by Claude Code (preferred, non-blocking)
  const hookEvent = process.env.CLAUDE_HOOK_EVENT || '';

  if (hookEvent.includes('Stop')) {
    return 'complete';
  }
  if (hookEvent.includes('Notification')) {
    return 'attention';
  }

  // Early return if env var was set but didn't match - avoid blocking stdin read
  if (hookEvent) {
    return 'complete';
  }

  // Fallback: try to determine from stdin (only if no env var)
  // Note: This can block if stdin is not closed, but is kept for compatibility
  try {
    const inputData = fs.readFileSync(0, 'utf-8');
    const data = JSON.parse(inputData);

    if (data.hook_type === 'Stop' || data.event === 'Stop') {
      return 'complete';
    }
    if (data.hook_type === 'Notification' || data.event === 'Notification') {
      return 'attention';
    }
  } catch {
    // Ignore parse errors - stdin may be empty or invalid JSON
  }

  return 'complete';
}

function findLinuxSound(type) {
  const primarySound = SOUNDS.linux[type];
  if (fs.existsSync(primarySound)) {
    return primarySound;
  }

  // Try fallback sounds
  for (const sound of LINUX_FALLBACK_SOUNDS) {
    if (fs.existsSync(sound)) {
      return sound;
    }
  }

  return null;
}

// Notification messages per type
const NOTIFICATIONS = {
  complete: {
    title: 'Claude Code',
    message: 'Task complete'
  },
  attention: {
    title: 'Claude Code',
    message: 'Action required'
  }
};

function showNotification(type) {
  const platform = os.platform();
  const { title, message } = NOTIFICATIONS[type];

  switch (platform) {
    case 'darwin': {
      // macOS: use osascript (native, no dependencies)
      // execSync to ensure notification is shown before process exits
      try {
        execSync(`osascript -e 'display notification "${message}" with title "${title}"'`, {
          stdio: 'ignore'
        });
      } catch {
        // Ignore errors
      }
      break;
    }

    case 'linux': {
      // Linux: use notify-send (libnotify)
      const icon = type === 'complete' ? 'dialog-information' : 'dialog-warning';
      spawn('notify-send', [
        '--app-name=Claude Code',
        `--icon=${icon}`,
        title,
        message
      ], { stdio: 'ignore', detached: true }).unref();
      break;
    }

    case 'win32': {
      // Windows: use PowerShell toast notification
      // Escape special XML characters to prevent injection
      const escapeXml = (str) => str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      const safeTitle = escapeXml(title);
      const safeMessage = escapeXml(message);

      const toastScript = `
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $template = '<toast><visual><binding template="ToastText02"><text id="1">${safeTitle}</text><text id="2">${safeMessage}</text></binding></visual></toast>'
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml($template)
        $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show($toast)
      `;
      spawn('powershell.exe', [
        '-NoProfile',
        '-Command',
        toastScript
      ], { stdio: 'ignore', detached: true }).unref();
      break;
    }
  }
}

function playSound(type) {
  const platform = os.platform();

  switch (platform) {
    case 'darwin': {
      // macOS: use afplay
      const soundFile = SOUNDS.darwin[type];
      if (fs.existsSync(soundFile)) {
        spawn('afplay', [soundFile], { stdio: 'ignore', detached: true }).unref();
      } else {
        // Fallback to system bell
        process.stdout.write('\x07');
      }
      break;
    }

    case 'linux': {
      const soundFile = findLinuxSound(type);

      if (soundFile) {
        // Try paplay first (PulseAudio)
        const paplay = spawn('paplay', [soundFile], { stdio: 'ignore', detached: true });
        paplay.on('error', () => {
          // Try aplay (ALSA)
          const aplay = spawn('aplay', ['-q', soundFile], { stdio: 'ignore', detached: true });
          aplay.on('error', () => {
            // Fallback to terminal bell
            process.stdout.write('\x07');
          });
          aplay.unref();
        });
        paplay.unref();
      } else {
        // No sound file found, use terminal bell
        process.stdout.write('\x07');
      }
      break;
    }

    case 'win32': {
      // Windows: use PowerShell
      const soundType = type === 'complete' ? 'Asterisk' : 'Exclamation';
      spawn('powershell.exe', [
        '-NoProfile',
        '-Command',
        `[System.Media.SystemSounds]::${soundType}.Play()`
      ], { stdio: 'ignore', detached: true }).unref();
      break;
    }

    default: {
      // Unknown platform: terminal bell
      process.stdout.write('\x07');
    }
  }
}

// Main execution
const hookType = getHookType();

if (CONFIG.sound) {
  playSound(hookType);
}

if (CONFIG.visual) {
  showNotification(hookType);
}

// Exit successfully
process.exit(0);
