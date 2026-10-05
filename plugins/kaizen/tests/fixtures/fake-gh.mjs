#!/usr/bin/env node
// Fake `gh` for the tests: answers from $FAKE_GH_STATE (JSON) and logs mutations there.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.FAKE_GH_STATE;
const st = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
const save = () => writeFileSync(file, JSON.stringify(st, null, 2));
const field = (name) => {
  const i = args.findIndex((a, j) => (args[j - 1] === '-f' || args[j - 1] === '-F') && a.startsWith(`${name}=`));
  return i >= 0 ? args[i].slice(name.length + 1) : null;
};

if (args[0] === 'repo' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({ nameWithOwner: st.repo }));
} else if (args[0] === 'pr' && args[1] === 'view') {
  process.stdout.write(JSON.stringify({ number: st.pr.number }));
} else if (args[0] === 'pr' && args[1] === 'comment') {
  const body = readFileSync(0, 'utf8');
  st.log.push({ op: 'comment', body });
  save();
  process.stdout.write('https://github.com/o/r/pull/1#issuecomment-new\n');
} else if (args[0] === 'api' && args[1] === 'graphql') {
  const q = field('query');
  if (/addPullRequestReviewThreadReply/.test(q)) {
    st.log.push({ op: 'reply', thread: field('thread'), body: field('body') });
    save();
    process.stdout.write(JSON.stringify({ data: { addPullRequestReviewThreadReply: { comment: { url: 'https://x/reply' } } } }));
  } else if (/resolveReviewThread/.test(q)) {
    st.log.push({ op: 'resolve', thread: field('thread') });
    save();
    process.stdout.write(JSON.stringify({ data: { resolveReviewThread: { thread: { id: field('thread'), isResolved: true } } } }));
  } else {
    const cursor = field('cursor');
    const pages = st.pr.reviewThreadPages || [st.pr.reviewThreads];
    const idx = cursor ? Number(cursor) : 0;
    const pr = { ...st.pr, reviewThreads: { pageInfo: { hasNextPage: idx + 1 < pages.length, endCursor: String(idx + 1) }, nodes: pages[idx] } };
    delete pr.reviewThreadPages;
    process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: pr } } }));
  }
} else if (args[0] === 'api' && args.includes('PUT')) {
  st.log.push({ op: 'update-branch', path: args.find((a) => a.includes('update-branch')), sha: field('expected_head_sha') });
  save();
  process.stdout.write('{}');
} else {
  process.stderr.write(`fake-gh: command not simulated ${args.join(' ')}\n`);
  process.exit(1);
}
