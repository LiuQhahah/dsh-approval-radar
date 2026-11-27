// Renders ApprovalRadar through a hook-ordered React stub and asserts the tree:
// pill copy, the "nothing to show" cases, row order, and the row contents.
//
// Run: node test/render.mjs
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const failures = []
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}

const dictionary = {
  pillOne: '1 session needs you',
  pillMany: '{n} sessions need you',
  pillTitle: 'Sessions waiting for you',
  panelTitle: 'Waiting for you',
  kindApproval: 'approval',
  kindPlanReview: 'plan review',
  kindQuestion: 'question',
  noCwd: 'no workspace',
}

const documentStub = {
  head: { querySelector: () => null, appendChild: () => {}, children: [] },
  title: 'DeepSeek Harness',
  createElement: tag => ({ tag, id: '', textContent: '', isConnected: true, remove() {} }),
  getElementById: () => null,
  querySelector: () => null,
  activeElement: null,
}

const sandbox = {
  window: { __ModuleLoader__: { load({ factory }) { sandbox.__exports = factory(name => {
    if (name !== 'react') throw new Error(`unexpected require: ${name}`)
    return ReactStub
  }) } } },
  document: documentStub,
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: () => 0,
  setTimeout,
  Date,
  console,
}

const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useRef: initial => ({ current: initial }),
  useState: initial => [typeof initial === 'boolean' ? (globalThis.__expanded ?? initial) : initial, () => {}],
  useMemo: fn => fn(),
  useEffect: () => {},
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

const registered = []
const ctx = {
  effect: fn => fn(),
  locale: { register: () => () => {}, bind: () => key => key },
  slots: {
    inject: (key, cb) => {
      const it = cb()
      while (!it.next().done) { /* drain */ }
    },
    register: (options, component) => { registered.push({ options, component }); return () => {} },
  },
  inject: () => {},
  get: () => undefined,
}
sandbox.__exports.apply(ctx)

const Component = registered[0].component
const jumpTo = registered[0].options.inject().jumpTo

const list = {
  ids: ['s1', 's2', 's3'],
  byId: {
    s1: { id: 's1', title: 'Fix login bug', displayTitle: 'Fix login bug', cwd: '/Users/me/proj/a', retainedBy: { mainView: 1 } },
    s2: { id: 's2', title: 'Add docs', displayTitle: 'Add docs', cwd: '/Users/me/proj/b', retainedBy: {} },
    s3: { id: 's3', title: 'Idle', displayTitle: 'Idle', cwd: '/Users/me/proj/c', retainedBy: {} },
  },
  phase: 'ready',
  projectionsBySession: {},
}

function render(statuses, sessions = list) {
  return Component({
    useSessionStatus: selector => selector(statuses),
    useSessions: selector => selector(sessions),
    jumpTo,
    t: (key, params) => {
      const text = dictionary[key] ?? key
      return params === undefined ? text : text.replace(/\{(\w+)\}/g, (m, name) => String(params[name] ?? m))
    },
  })
}

const textOf = node => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

// The pill carries a chevron span; strip it so copy assertions read cleanly.
const pillText = tree => textOf(findByClass(tree, 'approval-radar-pill')[0]).replace(/[▲▼]$/, '')

const findByClass = (node, cls, out = []) => {
  if (node === null || node === undefined || typeof node === 'string') return out
  if (Array.isArray(node)) { node.forEach(n => findByClass(n, cls, out)); return out }
  if (node.props?.className === cls) out.push(node)
  node.children.forEach(n => findByClass(n, cls, out))
  return out
}

const status = (id, kind) => [id, {
  running: true,
  pendingInteraction: kind === undefined ? undefined : { kind, key: `k-${id}`, sessionId: id },
  completionUnread: false,
}]

// Case 1: the session on screen waits too; only the other one is advertised.
const case1 = new Map([status('s1', 'approval'), status('s2', 'question'), status('s3', undefined)])
const tree1 = render(case1)
check('case1 pill copy', pillText(tree1), '1 session needs you')
check('case1 panel is collapsed', findByClass(tree1, 'approval-radar-panel').length, 0)

// Case 2: only the session on screen waits — nothing to advertise.
const case2 = new Map([status('s1', 'approval'), status('s3', undefined)])
check('case2 renders nothing', render(case2), null)

// Case 3: three waiting, and no session holds the main view — so all three count.
const listNoMain = {
  ...list,
  byId: {
    ...list.byId,
    s1: { ...list.byId.s1, retainedBy: {} },
  },
}
const case3 = new Map([status('s2', 'question'), status('s3', 'plan-review'), status('s1', 'approval')])
const tree3 = render(case3, listNoMain)
check('case3 pill copy', pillText(tree3), '3 sessions need you')

// Case 4: open the panel and inspect the rows.
globalThis.__expanded = true
const tree4 = render(case3, listNoMain)
const rows = findByClass(tree4, 'approval-radar-item')
check('case4 row count', rows.length, 3)
check('case4 header', textOf(findByClass(tree4, 'approval-radar-head')[0]), 'Waiting for you')
check('case4 rows ordered approval, plan review, question', rows.map(r => textOf(r)), [
  'Fix login bugapproval…/proj/a',
  'Idleplan review…/proj/c',
  'Add docsquestion…/proj/b',
])

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('\nrender: all checks passed')
