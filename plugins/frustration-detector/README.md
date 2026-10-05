# Frustration Detector plugin

Detects developer frustration in prompts and injects context so that Claude adapts its response style
automatically: less talk, more action.

## Installation

```bash
/plugin install frustration-detector@angelo-plugins
```

Prerequisite: Node.js. No npm dependency.

## Features

A `UserPromptSubmit` hook analyzes each message before it is processed and injects adapted context when
frustration is detected. Detection works on **French and English** prompts.

### 4 detected types of frustration

| Type | Triggers | Claude's reaction |
|---|---|---|
| **Anger** | Swear words (FR/EN), insults, blame (`putain`, `fuck`, `wtf`, `tu as tout cassé`, `you broke everything`…) | Silent action mode: zero preamble, code only |
| **Impatience** | Anti-verbosity (`finis`, `just do it`, `arrête d'expliquer`, `code only`…) | Zero explanation, autonomous choices, whole task in 1 response |
| **Confusion** | Being stuck (`ça marche pas`, `I'm stuck`, `je comprends rien`, `same error`…) | Brief diagnosis + immediate fix, concrete examples |
| **Sarcasm** | Resignation (`merci pour rien`, `I'll use Cursor`, `laisse tomber`, `never mind`…) | Immediate action, no apologies, concrete solution |

When several types match, the priority is anger > sarcasm > confusion > impatience; anger and confusion
together combine both instructions (brief diagnosis, zero fluff).

### Amplifying signals

- Messages in CAPITALS (at least 3 words)
- Excessive punctuation (`???`, `!!!`, `?!?!`)

An amplified message adds a "strong signal" note requiring an ultra-concise answer.

### False-positive mitigation

- Common impatience terms (`continue`, `go on`, `keep going`, `come on`, `allez`) only trigger the
  injection in short messages (< 20 words)
- The script never blocks prompts (always exit 0) — it only adds context
- French terms starting or ending with an accented letter (`ça`, `cassé`, `écoute`) are matched on
  letter boundaries, not on `\b` (which ignores accented letters)

### Language coverage

- **French**: ~100 terms/expressions (swear words, slang, texting)
- **English**: ~100 terms/expressions (swear words, slang, abbreviations)
- **Onomatopoeia**: `argh`, `ugh`, `grr`, `pfff`, `raaah`…
- **Abbreviations**: `wtf`, `ffs`, `omfg`, `jfc`, `fml`, `stfu`
- **Passive-aggressive**: `comme je t'ai dit`, `I already told you`, `wrong again`, `ça fait 3 fois`…

The detection lists stay bilingual on purpose: they match what developers actually type. The context
injected for Claude is in English.

## How it works

```
The user types "putain ça marche pas"
  → UserPromptSubmit hook triggered
  → the script detects: anger + confusion
  → context injected: "Maximum action mode + brief diagnosis"
  → Claude answers with a direct fix, no fluff
```

The script never blocks the prompt (exit code 0). It injects context through JSON on `stdout`
(`hookSpecificOutput.additionalContext`) to guide Claude's response:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "The user is frustrated. Maximum action mode: - ZERO preamble, …"
  }
}
```

Test it by hand:

```bash
echo '{"prompt":"wtf it still does not work???"}' | node scripts/detect-frustration.js
```

## Structure

```
frustration-detector/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   └── hooks.json
├── scripts/
│   └── detect-frustration.js
└── README.md
```
