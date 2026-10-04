#!/usr/bin/env node

/**
 * Claude Code UserPromptSubmit Hook — Frustration Detector
 * Detects developer frustration in prompts and injects context
 * so Claude adapts its response style (less talk, more action).
 *
 * Exit codes:
 *   0 = Allow (with optional JSON stdout containing context injection)
 *   2 = Block (not used — we never block user prompts)
 */

// ─── Frustration patterns by category ───────────────────────────────────────

// Type A: ANGER — swear words, insults, blame
const ANGER_PATTERNS = [
  // French swear words
  /\bputain\b/i, /\bmerde\b/i, /\bbordel\b/i, /\bfait\s+chier\b/i,
  /\bsaloperie\b/i, /\bconnerie\b/i, /\bnom\s+de\s+dieu\b/i,
  /\bputain\s+de\s+merde\b/i, /\bbordel\s+de\s+merde\b/i,
  /\benculé/i, /\bchiotte/i, /\bnique\b/i,
  /\bc'est\s+de\s+la\s+merde\b/i, /\bc'est\s+quoi\s+cette?\s+merde\b/i,
  /\bc'est\s+quoi\s+ce\s+bordel\b/i,
  /\btu\s+fais\s+n'importe\s+quoi\b/i, /\btu\s+as\s+tout\s+cassé(?![\wÀ-ſ])/i,
  /\btu\s+régresses\b/i, /\bc'était\s+mieux\s+avant\b/i,
  /\bputain\s+de\s+bordel\b/i,
  // SMS/censored French
  /\bp\*tain\b/i, /\bptain\b/i, /\bput1\b/i, /\bmrd\b/i,
  // English swear words
  /\bfuck\b/i, /\bshit\b/i, /\bdamn\s*it\b/i, /\bgoddamn\b/i,
  /\bcrap\b/i, /\bbullshit\b/i, /\bholy\s+shit\b/i,
  /\bfor\s+fuck'?s?\s+sake\b/i, /\bson\s+of\s+a\s+bitch\b/i,
  /\bpiece\s+of\s+shit\b/i, /\bbloody\s+hell\b/i, /\bbollocks\b/i,
  /\byou\s+broke\s+it\b/i, /\byou\s+made\s+it\s+worse\b/i,
  // Abbreviations
  /\bwtf\b/i, /\bffs\b/i, /\bomfg\b/i, /\bjfc\b/i,
  /\bfml\b/i, /\bstfu\b/i,
];

// Type B: IMPATIENCE — continuation, anti-verbosity
const IMPATIENCE_PATTERNS = [
  // French
  /\bfinis\b/i, /\btermine\b/i, /\bavance\b/i, /\baccélère\b/i,
  /\bdépêche/i, /\bvas-y\b/i, /\bfais-le\b/i, /\bjuste\s+fais-le\b/i,
  /\barrête\s+de\s+parler\b/i, /\barrête\s+d'expliquer\b/i,
  /\bmoins\s+de\s+blabla\b/i, /\btais-toi\s+et\s+code\b/i,
  /\ballez\b/i,
  // English
  /\bjust\s+do\s+it\b/i, /\bstop\s+explaining\b/i, /\bstop\s+talking\b/i,
  /\bjust\s+fix\s+it\b/i, /\bget\s+to\s+the\s+point\b/i,
  /\bskip\s+the\s+explanation\b/i, /\bless\s+talk\b/i,
  /\bshut\s+up\s+and\s+code\b/i, /\bdon'?t\s+explain\b/i,
  /\bjust\s+the\s+code\b/i, /\bcode\s+only\b/i,
  /\bfinish\s+it\b/i, /\bdo\s+it\s+already\b/i,
  /\bhurry\s+up\b/i, /\bfaster\b/i,
  /\bi\s+don'?t\s+care\s+why\b/i,
  // Both — only match as standalone short messages (handled in logic)
  // "continue", "go on", "keep going", "come on", "allez"
];

// Short-message-only impatience (only trigger in messages < 20 words)
const SHORT_IMPATIENCE_PATTERNS = [
  /^continue[sz]?$/i, /^go\s+on$/i, /^keep\s+going$/i, /^come\s+on$/i,
  /^continues?$/i, /^t'as\s+pas\s+fini/i, /^tu\s+vas\s+finir/i,
];

// Type C: CONFUSION / HELPLESSNESS
const CONFUSION_PATTERNS = [
  // French
  /(?<![\wÀ-ſ])ça\s+marche\s+pas\b/i, /(?<![\wÀ-ſ])ça\s+fonctionne\s+pas\b/i,
  /\bc'est\s+cassé(?![\wÀ-ſ])/i, /\bc'est\s+pété(?![\wÀ-ſ])/i, /\bc'est\s+nul\b/i,
  /\bje\s+comprends?\s+pas\b/i, /\bje\s+comprends?\s+rien\b/i,
  /\bj'y\s+arrive\s+pas\b/i, /(?<![\wÀ-ſ])ça\s+veut\s+pas\b/i,
  /\bje\s+suis\s+perdu/i, /\bje\s+suis\s+bloqué/i, /\bje\s+suis\s+coincé/i,
  /\bc'est\s+la\s+galère\b/i, /\bc'est\s+l'enfer\b/i,
  /\bpourquoi\s+ça\s+marche\s+pas\b/i, /\bmais\s+pourquoi\b/i,
  /\bje\s+pige\s+pas\b/i, /\bje\s+capte\s+pas\b/i,
  /\bc'est\s+incompréhensible\b/i,
  /\bj'en\s+ai\s+marre\b/i, /\bj'en\s+ai\s+ras\s+le\s+bol\b/i,
  /(?<![\wÀ-ſ])ça\s+me\s+saoule\b/i, /(?<![\wÀ-ſ])ça\s+me\s+gonfle\b/i, /(?<![\wÀ-ſ])ça\s+me\s+gave\b/i,
  /\brien\s+ne\s+marche\b/i, /\bj'abandonne\b/i, /\bj'en\s+peux\s+plus\b/i,
  /\bon\s+tourne\s+en\s+rond\b/i,
  /\btoujours\s+le\s+même\s+(bug|problème|erreur)\b/i,
  /\bc'est\s+toujours\s+pareil\b/i,
  /\bc'est\s+n'importe\s+quoi\b/i,
  // English
  /\bdoesn'?t\s+work\b/i, /\bnot\s+working\b/i,
  /\bit'?s\s+broken\b/i, /\bstill\s+broken\b/i, /\bstill\s+not\s+working\b/i,
  /\bi\s+give\s+up\b/i, /\bwhat\s+the\s+hell\b/i,
  /\bwhat\s+is\s+wrong\b/i, /\bmakes?\s+no\s+sense\b/i,
  /\bthis\s+is\s+ridiculous\b/i, /\bthis\s+is\s+insane\b/i,
  /\bi'?m\s+stuck\b/i, /\bi\s+don'?t\s+get\s+it\b/i,
  /\bi\s+don'?t\s+understand\b/i,
  /\bnothing\s+works\b/i, /\beverything\s+is\s+broken\b/i,
  /\bsame\s+(error|problem|bug|issue)\b/i, /\bnot\s+again\b/i,
  /\bthis\s+is\s+impossible\b/i, /\bi\s+hate\s+this\b/i,
  /\bgoing\s+in\s+circles\b/i, /\bit\s+was\s+working\s+before\b/i,
  /\bwhy\s+is\s+this\s+so\s+hard\b/i,
  // Onomatopoeia
  /\bar+gh\b/i, /\bu+gh\b/i, /\bgr+\b/i,
  /\bpf+\b/i, /\bra+h\b/i, /\bno+o+\b/i, /\bbruh\b/i,
];

// Type D: SARCASM / RESIGNATION
const SARCASM_PATTERNS = [
  // French
  /\bmerci\s+pour\s+rien\b/i, /\boh\s+génial\b/i,
  /\bformidable\b/i, /\bmagnifique\b/i,
  /\bc'est\s+pas\s+comme\s+si\b/i,
  /\bremets?\s+comme\s+avant\b/i, /\bremets?\s+tout\b/i,
  /\bannule\s+tout\b/i, /\boublie\b/i,
  /\blaisse\s+tomber\b/i, /\btant\s+pis\b/i,
  /\bje\s+vais\s+le\s+faire\s+moi-même\b/i,
  /\bje\s+vais\s+utiliser\s+(cursor|copilot|chatgpt)\b/i,
  /\bsérieux\s*\?/i,
  // English
  /\bthanks\s+for\s+nothing\b/i, /\boh\s+great\b/i,
  /\bwonderful\b/i, /\bamazing\s+job\b/i, /\bgood\s+job\s+breaking\b/i,
  /\bnever\s+mind\b/i, /\bforget\s+it\b/i, /\bjust\s+forget\s+it\b/i,
  /\bput\s+it\s+back\b/i, /\bundo\s+everything\b/i,
  /\bi'?ll\s+do\s+it\s+myself\b/i,
  /\bmaybe\s+i\s+should\s+just\b/i,
  /\bi'?ll\s+use\s+(cursor|copilot|chatgpt)\b/i,
  /\bseriously\s*\?/i,
];

// Passive-aggressive patterns
const PASSIVE_AGGRESSIVE_PATTERNS = [
  // French
  /\bcomme\s+je\s+t'ai\s+dit\b/i, /\bje\s+t'ai\s+déjà\s+dit\b/i,
  /\bje\s+l'ai\s+déjà\s+dit\b/i, /\brelis\s+ce\s+que\b/i,
  /\bc'est\s+pas\s+ce\s+que\s+j'ai\s+demandé(?![\wÀ-ſ])/i,
  /\bt'as\s+pas\s+compris\b/i, /\btu\s+comprends?\s+pas\b/i,
  /\bencore\s*\?!\b/i, /(?<![\wÀ-ſ])ça\s+fait\s+\d+\s+fois\b/i,
  /\btu\s+fais\s+n'importe\s+quoi\b/i,
  /\bc'est\s+pas\s+ça\b/i, /\bnon\s+non\s+non\b/i,
  /(?<![\wÀ-ſ])écoute-moi\b/i, /\bconcentre-toi\b/i,
  // English
  /\bi\s+already\s+told\s+you\b/i, /\bi\s+said\s+this\s+before\b/i,
  /\blike\s+i\s+said\b/i, /\bas\s+i\s+mentioned\b/i,
  /\bi'?ve\s+already\s+explained\b/i, /\bread\s+what\s+i\s+wrote\b/i,
  /\bdid\s+you\s+even\s+read\b/i,
  /\bthat'?s\s+not\s+what\s+i\s+asked\b/i,
  /\byou'?re\s+not\s+listening\b/i, /\bpay\s+attention\b/i,
  /\bwrong\s+again\b/i, /\bstill\s+wrong\b/i,
  /\bwe'?ve\s+been\s+over\s+this\b/i,
];

// ─── Injection messages ─────────────────────────────────────────────────────

const INJECTIONS = {
  anger: [
    "The user is frustrated. Maximum action mode:",
    "- ZERO preamble, ZERO apology, ZERO \"I understand\".",
    "- Produce ONLY the fix/code. If you caused the problem, fix it silently.",
    "- Shortest possible answer. Code blocks only. One sentence of context at most.",
    "- Bias toward action: edit the file, run the command, show the result.",
  ].join(' '),

  impatience: [
    "The user wants brevity. Until further notice:",
    "- Remove ALL explanations, caveats and preambles. Output = code and actions only.",
    "- Do not ask for confirmation — make reasonable choices and execute.",
    "- One sentence of context at most. Never bullet points or structured prose.",
    "- Complete the WHOLE task in this response.",
  ].join(' '),

  confusion: [
    "The user is stuck/confused. Adjust your approach:",
    "- Brief diagnosis of the root cause (1-2 sentences max), then apply the fix immediately.",
    "- If the problem is conceptual, use a minimal concrete example (3-5 lines of code).",
    "- Avoid jargon the user does not use. No wall of text.",
    "- When in doubt, fix the most likely problem and state your hypothesis briefly.",
  ].join(' '),

  sarcasm: [
    "The user is sarcastic or resigned — they are losing trust.",
    "- If a mistake was made, fix it immediately without superfluous comment.",
    "- Propose a concrete solution in 1 sentence. Do not apologize at length.",
    "- Show through action that the situation is under control.",
    "- If the user asks for a revert/undo, do it first, then propose an alternative.",
  ].join(' '),
};

// ─── Detection logic ────────────────────────────────────────────────────────

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hasAmplifier(text) {
  // All caps (at least 3 words in caps)
  const words = text.split(/\s+/);
  const capsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length >= 3) return true;

  // Excessive punctuation
  if (/[?!]{3,}/.test(text)) return true;
  if (/\?!|\?{2,}|!{3,}/.test(text)) return true;

  return false;
}

function matchesAny(text, patterns) {
  return patterns.some(p => p.test(text));
}

function detect(text) {
  if (!text || text.trim().length === 0) return null;

  const wordCount = countWords(text);
  const amplified = hasAmplifier(text);

  // Score each category
  const scores = {
    anger: matchesAny(text, ANGER_PATTERNS) || matchesAny(text, PASSIVE_AGGRESSIVE_PATTERNS),
    impatience: matchesAny(text, IMPATIENCE_PATTERNS) ||
      (wordCount < 20 && SHORT_IMPATIENCE_PATTERNS.some(p => p.test(text.trim()))),
    confusion: matchesAny(text, CONFUSION_PATTERNS),
    sarcasm: matchesAny(text, SARCASM_PATTERNS),
  };

  // Priority: anger > sarcasm > confusion > impatience
  // Combine if multiple categories match
  const detected = [];
  if (scores.anger) detected.push('anger');
  if (scores.sarcasm) detected.push('sarcasm');
  if (scores.confusion) detected.push('confusion');
  if (scores.impatience) detected.push('impatience');

  if (detected.length === 0) return null;

  // Pick primary category (first by priority)
  const primary = detected[0];

  // Build injection message
  let message = INJECTIONS[primary];

  // If multiple types, combine context
  if (detected.length > 1) {
    const secondary = detected[1];
    if (primary === 'confusion' && detected.includes('anger')) {
      // Confused AND angry: diagnose briefly but zero fluff
      message = INJECTIONS.confusion + ' ' + INJECTIONS.anger;
    } else if (primary === 'anger' && detected.includes('confusion')) {
      message = INJECTIONS.anger + ' ' + INJECTIONS.confusion;
    }
  }

  if (amplified) {
    message += ' [STRONG SIGNAL: the tone is very intense — ultra-concise answer required]';
  }

  return { type: primary, all: detected, message, amplified };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let inputData = '';

  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let data;
  try {
    data = JSON.parse(inputData);
  } catch {
    process.exit(0);
  }

  // UserPromptSubmit provides user_input or prompt
  const userInput = data.user_input || data.prompt || data.content || '';

  const result = detect(userInput);

  if (result) {
    // Output JSON with context injection on stdout
    const output = JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: result.message,
      },
    });
    process.stdout.write(output);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
