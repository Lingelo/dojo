// /kaizen:work executes a ready plan: code + green tests, conventional commits, nothing pushed.
import { SHOP, CSV_PLAN } from '../fixtures.mjs';

const PLAN = 'docs/plans/2026-10-02-001-feat-orders-csv-export-plan.md';
export default {
  name: 'work-plan',
  timeoutMinutes: 30,
  files: { ...SHOP, [PLAN]: CSV_PLAN },
  prompt: `/kaizen:work mode:return ${PLAN}`,
  checks: [
    ['src/csv.js and its tests exist', (_, c) => c.ls('src').includes('csv.js') && c.ls('src').includes('csv.test.js')],
    ['npm test is green', (_, c) => { const r = c.run('npm', ['test']); return { ok: r.code === 0, note: r.out.split('\n').filter((l) => /^# (pass|fail)/.test(l)).join(' ') }; }],
    ['AE1: total 24,00', (_, c) => c.run('node', ['-e', "import('./src/csv.js').then(m=>{const f=Object.values(m).find(x=>typeof x==='function');const s=f([{id:1,date:'2026-09-15',customer:'Ana',status:'new',items:[{priceCents:1000,qty:2}]}]);process.exit(s.includes('24,00')?0:1)})"]).code === 0],
    ['AE3: 10,001 orders refused', (_, c) => c.run('node', ['-e', "import('./src/csv.js').then(m=>{const f=Object.values(m).find(x=>typeof x==='function');const o=Array.from({length:10001},(_, i)=>({id:i,date:'d',customer:'c',status:'s',items:[]}));try{f(o);process.exit(1)}catch(e){process.exit(/10[\\s\\u202f\\u00a0.,]?001/.test(e.message)?0:1)}})"]).code === 0],
    ['conventional commits on a dedicated branch', (_, c) => {
      const branch = c.git('branch', '--show-current').trim();
      const log = c.git('log', '--format=%s', 'main..HEAD').trim().split('\n').filter(Boolean);
      return { ok: branch !== 'main' && log.length >= 1 && log.every((s) => /^(feat|fix|test|refactor|chore|docs)(\(.+\))?!?: /.test(s)), note: `${branch} · ${log.join(' / ')}` };
    }],
    // mode:return leaves the gate on: its caller (autopilot) keeps it for the whole run and turns it off itself
    ['gate left on for the caller (mode:return)', (_, c) => /"active":\s*true/.test(c.kaizen('gate', 'status').out)],
  ],
};
