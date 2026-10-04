// Kaizen — contrôle déterministe d'un plan (contrat kaizen-plan/v1).
// Vérifie la structure ; le jugement sur le fond reste à /kaizen:doc-review.

import { readFileSync } from 'node:fs';
import { parseFrontmatter } from './lib.mjs';

const CLARIFY_RE = /\[(À CLARIFIER|A CLARIFIER|NEEDS CLARIFICATION)\s*:[^\]]*\]/gi;

export function sectionText(body, id) {
  const start = body.indexOf(`<!-- kaizen:${id} -->`);
  if (start < 0) return null;
  const rest = body.slice(start + 1);
  const next = rest.search(/<!-- kaizen:[a-z-]+ -->/);
  return next < 0 ? rest : rest.slice(0, next);
}

function ids(text, prefix) {
  const out = new Set();
  const re = new RegExp(`(?:^|[^A-Za-z0-9])(${prefix}\\d+)(?![0-9])`, 'g');
  let m;
  while ((m = re.exec(text))) out.add(m[1]);
  return out;
}

function definedIds(text, prefix) {
  // Une définition = un identifiant en tête de puce ou de titre : « - R1. », « ### U2. », « KTD1. »
  const out = [];
  const re = new RegExp(`^\\s*(?:[-*]\\s+|#{2,4}\\s+)?(${prefix}\\d+)[.:]`, 'gm');
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

export function checkPlan(file, { constitution = null, stage = 'auto' } = {}) {
  const text = readFileSync(file, 'utf8');
  const { data, body, error } = parseFrontmatter(text);
  const errors = [];
  const warnings = [];
  if (!data) return { stage: 'invalid', errors: [error || 'frontmatter absent'], warnings };

  for (const k of ['title', 'type', 'date', 'topic', 'artifact']) if (!data[k]) errors.push(`frontmatter : ${k} manquant`);
  if (data.artifact && data.artifact !== 'kaizen-plan/v1') errors.push(`artifact inattendu : ${data.artifact}`);
  if (data.title && !/ - Plan$/.test(data.title)) warnings.push('title : suffixe « - Plan » attendu');
  if ('status' in data) errors.push('champ status interdit : l’avancement se lit dans git');

  const hasUnits = body.includes('<!-- kaizen:units -->');
  const detected = stage === 'auto' ? (hasUnits ? 'implementation-ready' : 'requirements') : stage;

  for (const id of ['goal', 'product']) if (!body.includes(`<!-- kaizen:${id} -->`)) errors.push(`section kaizen:${id} manquante`);

  const product = sectionText(body, 'product') || '';
  const reqs = definedIds(product, 'R');
  const aes = definedIds(product, 'AE');
  if (!reqs.length) errors.push('aucune exigence R1… dans le contrat produit');
  reqs.forEach((r, i) => {
    if (r !== `R${i + 1}`) errors.push(`exigences : numérotation non continue (${r} en position ${i + 1})`);
  });
  if (new Set(reqs).size !== reqs.length) errors.push('exigences : identifiant R en double');

  const clarify = body.match(CLARIFY_RE) || [];
  if (detected === 'implementation-ready' && clarify.length) {
    errors.push(`${clarify.length} marqueur(s) [À CLARIFIER : …] restant(s) — un plan prêt à implémenter n'en a aucun`);
  } else if (clarify.length) {
    warnings.push(`${clarify.length} marqueur(s) [À CLARIFIER : …] à résoudre avant planification`);
  }
  if (/\bTBD\b|\bTODO\b|\{\{[^}]+\}\}/.test(body)) errors.push('placeholder restant (TBD, TODO ou {{…}})');

  const report = { stage: detected, requirements: reqs.length, acceptance_examples: aes.length, units: 0, errors, warnings };
  if (detected !== 'implementation-ready') return report;

  for (const id of ['planning', 'units', 'verification', 'done']) if (!body.includes(`<!-- kaizen:${id} -->`)) errors.push(`section kaizen:${id} manquante`);
  if (!body.includes('<!-- kaizen:rollout -->')) warnings.push('section kaizen:rollout absente (déploiement et retour arrière) — requise dès que le changement atteint la production');
  else {
    // Sans signal ni retour arrière, la mise en production n'a ni critère de succès ni sortie de secours.
    const r = parseRollout(sectionText(body, 'rollout') || '');
    if (!r.rollback) warnings.push('kaizen:rollout : **Retour arrière** manquant');
    if (!r.signal) warnings.push('kaizen:rollout : **Signal** manquant (quoi surveiller après déploiement)');
    else if (!/[<>≤≥]|seuil|threshold|%|\d+\s*(ms|s|min|h)\b|au-del[àa]|plus de|more than/i.test(r.signal)) warnings.push('kaizen:rollout : **Signal** sans seuil — à quelle valeur revient-on en arrière ?');
  }

  const units = sectionText(body, 'units') || '';
  const unitIds = definedIds(units, 'U');
  report.units = unitIds.length;
  if (!unitIds.length) errors.push('aucune unité U1…');
  unitIds.forEach((u, i) => {
    if (u !== `U${i + 1}`) errors.push(`unités : numérotation non continue (${u} en position ${i + 1})`);
  });

  // Chaque unité : Couvre, Fichiers, Preuve, Vérification.
  const blocks = units.split(/^#{2,4}\s+(?=U\d+[.:])/m).slice(1);
  for (const b of blocks) {
    const id = /^(U\d+)/.exec(b)?.[1] || '?';
    for (const [label, re] of [
      ['Couvre', /\*\*(Couvre|Covers)\s*:/i],
      ['Fichiers', /\*\*(Fichiers|Files)\s*:/i],
      ['Preuve', /\*\*(Preuve|Proof|Evidence)\s*:/i],
      ['Vérification', /\*\*(Vérification|Verification)\s*:/i],
    ]) {
      if (!re.test(b)) errors.push(`${id} : champ **${label} :** manquant`);
    }
  }

  // Traçabilité : chaque R et chaque AE est couvert par une unité.
  const covered = new Set([...ids(units, 'R'), ...ids(units, 'AE')]);
  for (const r of reqs) if (!covered.has(r)) errors.push(`${r} n'est couvert par aucune unité`);
  for (const a of aes) if (!covered.has(a)) errors.push(`${a} n'est couvert par aucune unité (pas de scénario de test)`);
  for (const ref of covered) {
    if (/^R\d+$/.test(ref) && !reqs.includes(ref)) errors.push(`${ref} cité par une unité mais non défini`);
    if (/^AE\d+$/.test(ref) && !aes.includes(ref)) errors.push(`${ref} cité par une unité mais non défini`);
  }

  // Tranches : une tranche = une PR. Chaque unité appartient à une tranche si des tranches sont déclarées.
  const slices = [...units.matchAll(/\*\*(Tranche|Slice)\s*:\*\*\s*(\S+)/gi)].map((m) => m[2]);
  report.slices = new Set(slices).size || (unitIds.length ? 1 : 0);
  if (slices.length && slices.length !== blocks.length) warnings.push('certaines unités n’ont pas de **Tranche :** alors que d’autres en ont');

  // Constitution : chaque article apparaît dans le contrôle constitutionnel.
  if (constitution?.articles?.length) {
    const cc = sectionText(body, 'constitution');
    if (!cc) errors.push('section kaizen:constitution manquante (CONSTITUTION.md existe)');
    else {
      for (const a of constitution.articles) {
        // L'article est cité sous la forme « IV. » en début de cellule, de puce ou de ligne.
        const re = new RegExp(`(^|[|\\s*-])${a.id}\\.`, 'm');
        if (!re.test(cc)) errors.push(`contrôle constitutionnel : article ${a.id} (${a.title}) non évalué`);
      }
      if (/⚠️|exception/i.test(cc) && !/Justification|justifi/i.test(cc)) warnings.push('exception constitutionnelle sans justification visible');
    }
  }
  return report;
}

// Champs de la section kaizen:rollout : « - **Exposition** : … » (plusieurs lignes possibles).
export function parseRollout(text) {
  const fields = { exposure: /^exposition|^exposure/i, order: /^ordre|^order/i, rollback: /^retour arri|^rollback/i, signal: /^signal/i };
  const out = { exposure: '', order: '', rollback: '', signal: '' };
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+\*\*([^*]+?)\*\*\s*:?\s*:?\s*(.*)$/.exec(line);
    if (m) {
      current = Object.keys(fields).find((k) => fields[k].test(m[1].trim())) || null;
      if (current) out[current] = m[2].replace(/^:\s*/, '').trim();
    } else if (current && /^\s+\S/.test(line)) out[current] = `${out[current]} ${line.trim()}`.trim();
    else if (!line.trim()) current = null;
  }
  return out;
}
