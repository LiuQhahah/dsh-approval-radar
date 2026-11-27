/**
 * Client half of `dsh-approval-radar`.
 *
 * The problem it solves: with several Sessions open in several browser tabs, a
 * Session blocked on an approval is invisible unless you happen to be looking
 * at that tab. The Harness already projects the fact into the browser —
 * `@deepseek-ai/dsh-client-ui-session` publishes
 * `sessionStatus: Map<SessionId, { pendingInteraction }>`, and
 * `@deepseek-ai/dsh-client-ui-approval` fills it with `kind: 'approval'` for
 * every pending `approval/request` waterfall — but nothing outside the sidebar
 * row consumes it, so you still have to hunt for it.
 *
 * This module consumes that projection in three places:
 *
 * 1. A floating pill in the frame's `shell.overlay` seat lists every Session
 *    waiting for you. One click calls `uiWorkspace.openSession(sessionId)`,
 *    then focuses the approval card that lands in the composer, so Enter and
 *    Escape act on it immediately.
 * 2. A `⚠N` prefix on `document.title`, so the browser's own tab strip tells
 *    you that something needs you before you even look at the page.
 * 3. A keyboard shortcut that jumps straight to the first waiting Session from
 *    anywhere in the app.
 *
 * No Host route and no extra IPC: every bit of state is already in the browser.
 */
window.__ModuleLoader__.load({
  id: 'dsh-approval-radar',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'approvalRadar'
    /** Stylesheet element id, so a hot reload replaces instead of stacking. */
    const STYLE_ID = 'dsh-approval-radar-style'
    /** Shortcut command id claimed by this plugin. */
    const SHORTCUT_ID = 'approvalRadar.next'

    /**
     * Pending kinds this plugin surfaces. A `Map` rather than an object literal
     * so a hostile or unexpected `kind` string can never resolve through
     * `Object.prototype` (`'toString' in {}` is `true`), and so the list order
     * and the copy key live in one place instead of three parallel switches.
     */
    const KINDS = new Map([
      ['approval', { order: 0, labelKey: 'kindApproval' }],
      ['plan-review', { order: 1, labelKey: 'kindPlanReview' }],
      ['question', { order: 2, labelKey: 'kindQuestion' }],
    ])

    const en = {
      pillOne: '1 session needs you',
      pillMany: '{n} sessions need you',
      pillTitle: 'Sessions waiting for you — click to list them',
      panelTitle: 'Waiting for you',
      kindApproval: 'approval',
      kindPlanReview: 'plan review',
      kindQuestion: 'question',
      shortcutNext: 'Jump to the next session waiting for you',
      noCwd: 'no workspace',
    }

    const zh = {
      pillOne: '1 个会话在等你',
      pillMany: '{n} 个会话在等你',
      pillTitle: '有会话在等你 —— 点击列出',
      panelTitle: '等待你处理',
      kindApproval: '待审批',
      kindPlanReview: '待确认计划',
      kindQuestion: '待回答',
      shortcutNext: '跳到下一个等待你处理的会话',
      noCwd: '无工作区',
    }

    /**
     * Placement note: the bottom-right corner is already taken by the pet and
     * whale widgets, the top edge by the conversation header, and the bottom
     * edge by the composer. The right edge at mid-height is the one band that
     * is normally empty (the conversation keeps a centred text column), so the
     * pill is centred there and the panel unfolds upward from it.
     *
     * The panel is `position: absolute` rather than a flex sibling on purpose:
     * in normal flow, opening it made the container taller, which moved the
     * pill out from under the pointer that had just clicked it. Out of flow,
     * the container stays one pill tall and the anchor never shifts. Change
     * `top`/`right` here to move the whole radar.
     */
    const CSS = `
.approval-radar {
  position: fixed;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: min(380px, calc(100vw - 28px));
  font-family: inherit;
  font-size: 13px;
  line-height: 18px;
  /* The overlay layer is click-through; only the pill and the panel opt back
     in, so the radar never blocks the app between them. */
  pointer-events: none;
}
.approval-radar-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 13px;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-state-warn-primary, #c08a00);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-l2, #fffbe8));
  color: var(--dsw-alias-label-primary, #1f1f1f);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  pointer-events: auto;
}
.approval-radar-pill:hover {
  background: var(--dsw-alias-state-warn-tertiary, #fff2c2);
}
.approval-radar-pill:focus-visible {
  outline: 2px solid var(--dsw-alias-state-warn-primary, #c08a00);
  outline-offset: 2px;
}
.approval-radar-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-warn-primary, #c08a00);
  box-shadow: 0 0 0 3px var(--dsw-alias-state-warn-secondary, rgba(192, 138, 0, 0.28));
  animation: approval-radar-pulse 1.6s ease-in-out infinite;
}
@keyframes approval-radar-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  .approval-radar-dot { animation: none; }
}
.approval-radar-chev {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 10px;
}
.approval-radar-panel {
  /* Out of flow, so opening it never moves the pill that was just clicked. */
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  width: min(380px, calc(100vw - 28px));
  max-height: min(60vh, 460px);
  overflow: auto;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-l1, #ffffff));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
  pointer-events: auto;
}
.approval-radar-head {
  padding: 4px 8px 8px;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.approval-radar-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.approval-radar-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 2px;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f1f1f);
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.approval-radar-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
}
.approval-radar-item:focus-visible {
  outline: 2px solid var(--dsw-alias-state-warn-primary, #c08a00);
  outline-offset: -2px;
}
.approval-radar-item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.approval-radar-item-meta {
  display: flex;
  gap: 6px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #8a8a8a);
  font-size: 11px;
  line-height: 15px;
}
.approval-radar-item-kind {
  flex: none;
  color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary, #a06f00));
  font-weight: 500;
}
.approval-radar-item-cwd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`

    /**
     * Active locale binding, replaced whenever the plugin is (re)installed.
     * The bound translate function already interpolates `{name}` placeholders
     * (see `dsh-client-locale`'s `translate`), so this module does not
     * reimplement that.
     */
    let translate = null

    /**
     * Read one copy key from the plugin's own dictionary, for the places that
     * run outside a slot render (the shortcut label and resolver).
     * @param key - dictionary key.
     * @param params - `{name}` placeholders to interpolate.
     * @returns the translated string, falling back to English then the key.
     */
    function tr(key, params) {
      const text = translate === null ? undefined : translate(key, params)
      if (text === undefined || text === key) return en[key] ?? key
      return text
    }

    /** Replace (never stack) this plugin's stylesheet. */
    function installStyles() {
      const stale = document.getElementById(STYLE_ID)
      if (stale !== null) stale.remove()
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        if (style.isConnected) style.remove()
      }
    }

    /**
     * Keep a `⚠N` prefix on `document.title` without fighting
     * `dsh-client-ui-layout`'s `DocumentTitle`, which rewrites the whole title
     * whenever the focused Session's name changes.
     *
     * Whatever writes the title next, the prefix is re-derived from the
     * stripped base and written back once. Our own write is recognised by value
     * and ignored, so the loop settles immediately.
     *
     * Observation is scoped to the `<title>` element itself rather than all of
     * `<head>`, so unrelated sibling churn (style, meta, preload) cannot wake
     * this up; a second observer on `<head>`'s child list only re-attaches when
     * the title element is replaced outright.
     * @param count - number of pending interactions to advertise.
     */
    function useTitleBadge(count) {
      const countRef = React.useRef(count)
      countRef.current = count
      const applyRef = React.useRef(null)
      React.useEffect(() => {
        const strip = /^⚠\d+\s+/
        let lastWritten = null
        let titleEl = null
        let titleObserver = null

        const apply = () => {
          if (titleEl === null) return
          const current = titleEl.textContent ?? ''
          const base = current.replace(strip, '')
          const n = countRef.current
          const next = n > 0 ? `⚠${n} ${base}` : base
          if (next === current) return
          lastWritten = next
          titleEl.textContent = next
        }

        const onTitleMutation = () => {
          if (titleEl !== null && lastWritten !== null && titleEl.textContent === lastWritten) return
          apply()
        }

        const attach = () => {
          const el = document.head.querySelector('title')
          if (el === titleEl) return
          if (titleObserver !== null) titleObserver.disconnect()
          titleEl = el
          titleObserver = null
          if (el === null) return
          titleObserver = new MutationObserver(onTitleMutation)
          titleObserver.observe(el, { childList: true, subtree: true, characterData: true })
          apply()
        }

        applyRef.current = apply
        attach()
        const headObserver = new MutationObserver(attach)
        headObserver.observe(document.head, { childList: true })

        return () => {
          headObserver.disconnect()
          if (titleObserver !== null) titleObserver.disconnect()
          applyRef.current = null
          if (titleEl === null) return
          const current = titleEl.textContent ?? ''
          const base = current.replace(strip, '')
          if (base !== current) titleEl.textContent = base
        }
      }, [])
      React.useEffect(() => {
        applyRef.current?.()
      }, [count])
    }

    /** Shorten a workspace path to its last two segments. */
    function shortCwd(cwd) {
      if (typeof cwd !== 'string' || cwd === '') return ''
      const parts = cwd.split(/[\\/]+/).filter(part => part !== '')
      return parts.length <= 2 ? parts.join('/') : `…/${parts.slice(-2).join('/')}`
    }

    /**
     * The Session this tab currently shows in its main view, if any.
     *
     * Mirrors `UiSession.publishMain`'s own fallback: prefer whichever row
     * holds a `mainView` retention. Navigation releases the previous
     * retention when it switches (`navigation.ts` `replaceMain`), so at most
     * one row normally qualifies.
     */
    function mainViewId(list) {
      if (list === undefined) return undefined
      const current = Object.values(list.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
      return current === undefined ? undefined : current.id
    }

    /**
     * Every Session with a live pending interaction, sorted by kind then title.
     *
     * `sessionStatus` is this page's own projection of the forwarded
     * `approval/request` / `user-questions/request` waterfalls, so it names
     * Sessions the user can actually act on from here.
     * @param statuses - `sessionStatus` snapshot.
     * @param list - `sessions.list` snapshot.
     * @returns one row per waiting Session.
     */
    function collectWaiting(statuses, list) {
      if (statuses === undefined) return []
      const rows = []
      for (const [sessionId, status] of statuses) {
        const kind = status === undefined ? undefined : status.pendingInteraction?.kind
        const meta = kind === undefined ? undefined : KINDS.get(kind)
        if (meta === undefined) continue
        const summary = list === undefined ? undefined : list.byId[sessionId]
        const title = summary === undefined
          ? sessionId
          : (summary.title?.trim() || summary.displayTitle || sessionId)
        rows.push({
          sessionId,
          kind,
          title,
          cwd: summary === undefined ? undefined : summary.cwd,
          order: meta.order,
        })
      }
      rows.sort((left, right) => left.order - right.order
        || String(left.title).localeCompare(String(right.title)))
      return rows
    }

    /**
     * The `uiWorkspace` service, or undefined in a composition without it.
     * @param ctx - Client root context.
     */
    function resolveWorkspace(ctx) {
      const workspace = ctx.get?.('uiWorkspace')
      return workspace !== undefined && typeof workspace.openSession === 'function'
        ? workspace
        : undefined
    }

    /**
     * Focus the approval card that `openSession` just put in the composer.
     *
     * `ApprovalCard` only honours Enter / Escape while the event target is
     * inside the card (`ApprovalCard.tsx` `keydown` checks
     * `event.currentTarget.contains(document.activeElement)`), and landing in a
     * Session does not move focus there. The card's focusable region is the
     * `data-approval-scroll` body (`tabIndex={0}`); without this the user still
     * has to click the card before the keyboard does anything.
     *
     * Best effort by design: the card mounts a frame or two after the jump, and
     * a composition without the approval plugin simply never matches.
     */
    function focusApprovalCard() {
      const deadline = Date.now() + 1500
      const attempt = () => {
        const card = document.querySelector('[data-approval-key]')
        if (card !== null) {
          const active = document.activeElement
          // Never steal focus from a field the user is already typing in.
          if (active instanceof HTMLElement
            && (active.isContentEditable || active.matches('input, textarea, select'))) return
          const target = card.querySelector('[data-approval-scroll]') ?? card
          if (target instanceof HTMLElement) target.focus({ preventScroll: true })
          return
        }
        if (Date.now() < deadline) requestAnimationFrame(attempt)
      }
      requestAnimationFrame(attempt)
    }

    /**
     * Latest waiting rows, published by the mounted radar.
     *
     * The shortcut resolver needs the same answer the pill renders, but it runs
     * outside any slot render and therefore has no standard hooks. Reading the
     * services through `ctx.get` from the shortcut scope came back empty in
     * practice, so the component — which is *handed* `useSessionStatus` and
     * `useSessions` as standard props — publishes what it already computed.
     * Before the first render this stays `null` and the shortcut passes.
     */
    let waitingSnapshot = null

    /**
     * Floating radar: a pill counting the Sessions waiting for the user, and a
     * list that jumps to any of them.
     *
     * Root-scope slots receive `useSessions` / `useSessionStatus` as standard
     * props; `jumpTo` comes from this plugin's own `inject` seat.
     */
    function ApprovalRadar(props) {
      const { useSessionStatus, useSessions, jumpTo, t } = props
      const statuses = useSessionStatus(snapshot => snapshot)
      const list = useSessions(snapshot => snapshot)
      const [expanded, setExpanded] = React.useState(false)
      const text = typeof t === 'function' ? t : tr

      const waiting = React.useMemo(() => collectWaiting(statuses, list), [statuses, list])
      const currentId = React.useMemo(() => mainViewId(list), [list])

      /**
       * A Session whose card is already in front of you does not need a pill —
       * but it must not need a title badge either, or the tab strip would
       * advertise a Session this tab cannot usefully jump to. Both surfaces
       * therefore count the same reachable set.
       */
      const reachable = currentId === undefined
        ? waiting
        : waiting.filter(row => row.sessionId !== currentId)

      // Hand the shortcut resolver the rows this render just computed.
      waitingSnapshot = { rows: reachable, currentId }

      useTitleBadge(reachable.length)

      React.useEffect(() => {
        if (reachable.length === 0 && expanded) setExpanded(false)
      }, [expanded, reachable.length])

      const rootRef = React.useRef(null)
      React.useEffect(() => {
        if (!expanded) return undefined
        const onKeyDown = event => {
          if (event.key === 'Escape') setExpanded(false)
        }
        // Close on a click outside the pill/panel without stealing that click
        // from the app: the listener only observes.
        const onPointerDown = event => {
          const root = rootRef.current
          if (root !== null && event.target instanceof Node && root.contains(event.target)) return
          setExpanded(false)
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('pointerdown', onPointerDown, true)
        return () => {
          window.removeEventListener('keydown', onKeyDown)
          window.removeEventListener('pointerdown', onPointerDown, true)
        }
      }, [expanded])

      if (reachable.length === 0) return null

      const label = reachable.length === 1
        ? text('pillOne')
        : text('pillMany', { n: reachable.length })

      return h('div', { className: 'approval-radar', ref: rootRef },
        h('button', {
          type: 'button',
          key: 'pill',
          className: 'approval-radar-pill',
          title: text('pillTitle'),
          'aria-expanded': expanded,
          onClick: () => { setExpanded(value => !value) },
        },
          h('span', { className: 'approval-radar-dot', 'aria-hidden': 'true' }),
          h('span', null, label),
          h('span', { className: 'approval-radar-chev', 'aria-hidden': 'true' }, expanded ? '▲' : '▼'),
        ),
        expanded
          ? h('div', {
            key: 'panel',
            className: 'approval-radar-panel',
            role: 'dialog',
            'aria-label': text('panelTitle'),
          },
            h('div', { className: 'approval-radar-head' }, text('panelTitle')),
            h('ul', { className: 'approval-radar-list' },
              reachable.map(row => h('li', { key: row.sessionId },
                h('button', {
                  type: 'button',
                  className: 'approval-radar-item',
                  title: row.cwd === undefined ? row.title : `${row.title} — ${row.cwd}`,
                  onClick: () => {
                    setExpanded(false)
                    jumpTo(row.sessionId)
                  },
                },
                  h('span', { className: 'approval-radar-item-title' }, row.title),
                  h('span', { className: 'approval-radar-item-meta' },
                    h('span', { className: 'approval-radar-item-kind' },
                      text(KINDS.get(row.kind)?.labelKey ?? row.kind)),
                    h('span', { className: 'approval-radar-item-cwd' },
                      row.cwd === undefined || row.cwd === '' ? text('noCwd') : shortCwd(row.cwd)),
                  ),
                ),
              )),
            ),
          )
          : null,
      )
    }

    const inject = ['slots', 'locale']

    /**
     * Install copy, styles, the overlay seat, and the jump shortcut.
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const disposeZh = ctx.locale.register(NS, 'zh', zh)
        const disposeEn = ctx.locale.register(NS, 'en', en)
        translate = ctx.locale.bind(NS)
        return () => {
          translate = null
          disposeZh()
          disposeEn()
        }
      }, 'approval-radar: dictionaries')
      ctx.effect(() => installStyles(), 'approval-radar: styles')

      /** Open a Session and put the keyboard on whatever card it reveals. */
      const jumpTo = sessionId => {
        const workspace = resolveWorkspace(ctx)
        if (workspace === undefined) return
        workspace.openSession(sessionId)
        focusApprovalCard()
      }

      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({
          name: 'shell.overlay',
          id: 'approval-radar',
          order: 900,
          locale: NS,
          inject: () => ({ jumpTo }),
        }, ApprovalRadar)
      })
      // Optional: the seat is absent in compositions without the shortcut
      // service, and the pill still works there.
      ctx.inject(['shortcuts'], scope => {
        scope.effect(() => scope.shortcuts.register({
          id: SHORTCUT_ID,
          label: () => tr('shortcutNext'),
          aliases: ['approval radar', 'next approval', 'waiting approval'],
          // No `web:linux` entry, deliberately. `isWebBindingAllowed` admits
          // only three hard-coded combinations on Linux Web (`Slash+primary`,
          // `Comma+primary+shift`, `Period+primary+shift`), and `register`
          // *throws* on a profile it rejects — so declaring one here would
          // abort this whole registration on every platform, not just Linux.
          // The shipped `settings.open` omits it for the same reason. The pill
          // is the primary surface; the shortcut is the convenience.
          defaults: {
            'desktop:macos': { code: 'KeyJ', modifiers: ['primary', 'shift'] },
            'desktop:windows': { code: 'KeyJ', modifiers: ['primary', 'shift'] },
            'desktop:linux': { code: 'KeyJ', modifiers: ['primary', 'shift'] },
            'web:macos': { code: 'KeyJ', modifiers: ['primary', 'shift'] },
            'web:windows': { code: 'KeyJ', modifiers: ['primary', 'shift'] },
          },
          regions: ['page', 'editable'],
          modals: [],
          resolve: () => {
            if (resolveWorkspace(ctx) === undefined) return { status: 'pass' }
            // The mounted radar already filtered out the Session on screen.
            const snapshot = waitingSnapshot
            const next = snapshot === null ? undefined : snapshot.rows[0]
            if (next === undefined) return { status: 'pass' }
            return { status: 'handled', run: () => { jumpTo(next.sessionId) } }
          },
        }), 'approval-radar: jump shortcut')
      })
    }

    return { inject, apply }
  },
})
