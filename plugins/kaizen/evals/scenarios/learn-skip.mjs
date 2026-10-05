// The durability test: a fixed typo does not deserve a learning.
export default {
  name: 'learn-skip',
  timeoutMinutes: 8,
  files: { 'README.md': '# Project\n\nA small projet.\n', 'docs/learnings/.gitkeep': '' },
  steps: [{ files: { 'README.md': '# Project\n\nA small project.\n' }, commit: 'docs: fix a typo (projet → project)' }],
  prompt: '/kaizen:learn mode:auto I fixed a typo in the README (projet → project).',
  checks: [
    ['"Learning not written" signal', (out) => /Learning not written/i.test(out)],
    ['no learning created', (_, c) => c.ls('docs/learnings').filter((f) => f.endsWith('.md')).length === 0],
  ],
};
