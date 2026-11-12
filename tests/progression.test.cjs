/* Regression checks against the shipped content bank and app progression rule. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = {window: {}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context);
context.C = context.window.GALAXY_CONTENT;
context.state = {settings: {level: 'auto'}, history: {}, evidence: {}};
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const progression = source.match(/^function levelFor\(world\).*$/m);
assert.ok(progression, 'The app exposes a progression rule for inspection.');
vm.runInContext(progression[0], context);

let checks = 0;
function expect(world, expected, message) {
  assert.equal(context.levelFor(world), expected, `${world}: ${message}`);
  checks++;
}
function observe(world, items, independent = true) {
  context.state.history = Object.fromEntries(items.map(q => [q.id, {
    attempted: 1, completed: 1, independent: independent ? 1 : 0
  }]));
  context.state.evidence = {[world]: items.map(q => ({
    id: q.id, independent, completed: true
  }))};
}

for (const world of new Set(context.C.questions.map(q => q.world))) {
  const pool = context.C.questions.filter(q => q.world === world);
  const first = pool.filter(q => q.level === 1);
  const prerequisites = pool.filter(q => q.level <= 2);
  context.state.history = {};
  context.state.evidence = {};
  expect(world, 1, 'a new explorer starts at level one');

  // Arabic has only six starter items and twelve first/two-level items;
  // numbers has seven starter items. Fixed 8/16 thresholds locked them out.
  observe(world, first);
  expect(world, 2, 'the actual starter bank can unlock level two');
  observe(world, prerequisites);
  expect(world, 3, 'the actual prerequisite bank can unlock level three');

  observe(world, prerequisites, false);
  expect(world, 1, 'supported completions are not independent evidence');

  observe(world, prerequisites);
  context.state.evidence[world] = Array.from({length: 20}, () => ({
    id: first[0].id, independent: true, completed: true
  }));
  expect(world, 1, 'repeating one easy item does not supply varied evidence');

  observe(world, prerequisites);
  context.state.evidence[world].push(...Array.from({length: 20}, (_, i) => ({
    id: prerequisites[i % prerequisites.length].id,
    independent: false, completed: false
  })));
  expect(world, 1, 'recent unfinished attempts count against older successes');

  observe(world, prerequisites);
  context.state.evidence = {};
  expect(world, 1, 'old totals alone do not establish recent independence');

  context.state.settings.level = '3';
  expect(world, 3, 'the grown-up starting-point override remains available');
  context.state.settings.level = 'auto';
}

console.log(`PASS: ${checks} progression checks across all four content worlds.`);
