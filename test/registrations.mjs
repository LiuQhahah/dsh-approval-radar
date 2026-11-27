// Loads client.js in a Node VM with stub React and stub Cordis contexts, then
// asserts every registration the plugin makes. No browser, no dsh install.
//
// Run: node test/registrations.mjs
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const failures = []
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
}

const effects = []
const slots = []
const localeRegs = []
const shortcuts = []

function makeElement(tag) {
  return {
    tag,
    id: '',
    textContent: '',
    isConnected: true,
    children: [],
    remove() { this.isConnected = false },
  }
}

const head = makeElement('head')
head.querySelector = () => null
head.appendChild = el => { head.children.push(el); el.isConnected = true }

const documentStub = {
  head,
  title: 'DeepSeek Harness',
  createElement: tag => makeElement(tag),
  getElementById: id => head.children.find(el => el.id === id && el.isConnected) ?? null,
  querySelector: () => null,
  activeElement: null,
}

const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ id, factory }) {
        sandbox.__loaded = { id, exports: factory(makeRequire) }
      },
    },
  },
  document: documentStub,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame: () => 0,
  setTimeout,
  Date,
  console,
}

function makeRequire(name) {
  if (name !== 'react') throw new Error(`unexpected require: ${name}`)
  return {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: initial => ({ current: initial }),
    useState: initial => [initial, () => {}],
    useMemo: fn => fn(),
    useEffect: () => {},
  }
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.js' })

const loaded = sandbox.__loaded
check('module id', loaded.id, 'dsh-approval-radar')
check('exports', Object.keys(loaded.exports).sort(), ['apply', 'inject'])
check('inject (service names)', loaded.exports.inject, ['slots', 'locale'])

const statuses = new Map([
  ['s1', { running: true, pendingInteraction: { kind: 'approval', key: 'k1', sessionId: 's1' }, completionUnread: false }],
  ['s2', { running: true, pendingInteraction: { kind: 'question', key: 'k2', sessionId: 's2' }, completionUnread: false }],
  ['s3', { running: true, pendingInteraction: undefined, completionUnread: false }],
])
const list = {
  ids: ['s1', 's2', 's3'],
  byId: {
    s1: { id: 's1', title: 'Fix login bug', displayTitle: 'Fix login bug', cwd: '/a/b/proj', retainedBy: { mainView: 1 } },
    s2: { id: 's2', title: 'Add docs', displayTitle: 'Add docs', cwd: '/a/b/other', retainedBy: {} },
    s3: { id: 's3', title: 'Idle', displayTitle: 'Idle', cwd: '/a/b/third', retainedBy: {} },
  },
  phase: 'ready',
  projectionsBySession: {},
}

const opened = []
const ctx = {
  effect(fn, label) {
    effects.push(label)
    return fn()
  },
  locale: {
    register(ns, locale, dict) {
      localeRegs.push({ ns, locale, keys: Object.keys(dict).length })
      return () => {}
    },
    bind: () => (key, params) => {
      const dict = localeRegs.find(r => r.locale === 'zh')
      return dict === undefined ? key : key
    },
  },
  slots: {
    inject(key, cb) {
      const iterator = cb()
      let step = iterator.next()
      while (!step.done) {
        slots.push({ key, dispose: step.value })
        step = iterator.next()
      }
    },
    register(options, component) {
      slots.push({ registered: options, component })
      return () => {}
    },
  },
  inject(services, cb) {
    cb({
      effect(fn, label) { effects.push(label); return fn() },
      shortcuts: {
        register(command) {
          shortcuts.push(command)
          return () => {}
        },
      },
    })
  },
  get(name) {
    if (name === 'uiWorkspace') return { openSession: id => opened.push(id) }
    if (name === 'uiSession') return { sessionStatus: { getSnapshot: () => statuses } }
    if (name === 'sessions') return { list: { getSnapshot: () => list } }
    return undefined
  },
}

loaded.exports.apply(ctx)

check('effects registered', effects, [
  'approval-radar: dictionaries',
  'approval-radar: styles',
  'approval-radar: jump shortcut',
])
check('locale dictionaries', localeRegs.map(r => [r.locale, r.keys]), [['zh', 9], ['en', 9]])

const registered = slots.filter(s => s.registered !== undefined)
check('slot registrations', registered.map(s => ({
  name: s.registered.name, id: s.registered.id, order: s.registered.order, locale: s.registered.locale,
})), [{ name: 'shell.overlay', id: 'approval-radar', order: 900, locale: 'approvalRadar' }])

check('shortcut id', shortcuts[0].id, 'approvalRadar.next')
check('shortcut profiles (no web:linux, deliberately)', Object.keys(shortcuts[0].defaults), [
  'desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows',
])
check('shortcut binding', shortcuts[0].defaults['web:macos'], { code: 'KeyJ', modifiers: ['primary', 'shift'] })
check('shortcut regions', shortcuts[0].regions, ['page', 'editable'])

// The shortcut resolves against the snapshot the mounted radar published.
registered[0].component({
  useSessionStatus: selector => selector(statuses),
  useSessions: selector => selector(list),
  jumpTo: id => opened.push(id),
  t: key => key,
})

const resolution = shortcuts[0].resolve()
check('resolve with two waiting', resolution.status, 'handled')
resolution.run()
check('resolve jumps to the first waiting session', opened, ['s2'])

// Prototype-chain regression: a hostile kind must not be treated as known.
const hostile = new Map([['sX', { running: true, pendingInteraction: { kind: 'toString', key: 'k', sessionId: 'sX' }, completionUnread: false }]])
statuses.clear()
for (const [k, v] of hostile) statuses.set(k, v)
registered[0].component({
  useSessionStatus: selector => selector(statuses),
  useSessions: selector => selector(list),
  jumpTo: id => opened.push(id),
  t: key => key,
})
check('hostile kind is ignored', shortcuts[0].resolve().status, 'pass')

check('style element installed', head.children.filter(el => el.id === 'dsh-approval-radar-style').length, 1)
check('style carries the pill rule', /\.approval-radar-pill/.test(head.children[0].textContent), true)

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('\nregistrations: all checks passed')
