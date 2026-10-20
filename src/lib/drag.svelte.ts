import type { Destination } from './arrange.ts'
import { findDrop, type Box, type Drop, type Target } from './drop.ts'

// A touch picks a card up after holding still this long, so a swipe still scrolls the page.
const HOLD_MS = 400
// Moving this far starts a mouse drag, or turns a touch hold into a scroll.
const SLOP = 8
// Dragging this close to the top or bottom of the window scrolls the page.
const SCROLL_ZONE = 72

type Press = {
  element: HTMLElement
  id: string
  kind: string
  pointerId: number
  // Where the press began, in window coordinates, and how far the page was scrolled then.
  x: number
  y: number
  scroll: number
  // Set while a touch is waiting out the hold.
  timer?: ReturnType<typeof setTimeout>
  // The element's own spot, in page coordinates, once the drag has started.
  home?: Box
}

// Drag and drop for cards, stages and groups. Elements take part through data attributes:
// - `data-drag`: can be picked up; `data-id` and `data-kind` say what it is.
// - `data-drop`: can be dropped on, as a `card`, `stage` or `group`. A card in a group names it
//   in `data-group`.
// - `data-top`: one of the top level's items, which open-space drops are placed between.
// A mouse drags as soon as it moves. A touch holds still first, except on a grip (`data-grip`),
// which doesn't scroll the page.
export class Drag {
  // What's being dragged, once the drag has started.
  subject = $state<string>()
  // Where it would land if dropped now.
  drop = $state<Drop>()
  // The pointer, in window coordinates.
  pointer = $state({ x: 0, y: 0 })

  #onDrop: (id: string, to: Destination) => void
  #board: HTMLElement | undefined
  #press: Press | undefined
  #frame = 0

  constructor(onDrop: (id: string, to: Destination) => void) {
    this.#onDrop = onDrop
  }

  attach = (board: HTMLElement) => {
    this.#board = board
    const down = (event: PointerEvent) => this.#down(event)
    // A page can only stop a touch from scrolling with a listener that was there when the touch
    // began, so this one always is, and acts only during a drag.
    const touchmove = (event: TouchEvent) => {
      if (this.subject) event.preventDefault()
    }
    // A held finger opens the context menu on some phones.
    const contextmenu = (event: Event) => {
      if (this.#press) event.preventDefault()
    }
    board.addEventListener('pointerdown', down)
    board.addEventListener('touchmove', touchmove, { passive: false })
    board.addEventListener('contextmenu', contextmenu)
    return () => {
      this.#end()
      board.removeEventListener('pointerdown', down)
      board.removeEventListener('touchmove', touchmove)
      board.removeEventListener('contextmenu', contextmenu)
    }
  }

  #down(event: PointerEvent) {
    if (this.#press || !event.isPrimary || event.button !== 0) return
    const target = event.target as Element
    // Controls keep their own behavior.
    if (target.closest('button, input, select, textarea, a, label, summary, [popover]')) return
    const element = target.closest<HTMLElement>('[data-drag]')
    if (!element) return
    this.#press = {
      element,
      id: element.dataset.id!,
      kind: element.dataset.kind!,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scroll: scrollY,
    }
    this.pointer = { x: event.clientX, y: event.clientY }
    if (event.pointerType === 'touch' && !target.closest('[data-grip]')) {
      this.#press.timer = setTimeout(() => this.#start(), HOLD_MS)
    }
    addEventListener('pointermove', this.#move)
    addEventListener('pointerup', this.#up)
    addEventListener('pointercancel', this.#cancel)
  }

  #move = (event: PointerEvent) => {
    const press = this.#press
    if (event.pointerId !== press?.pointerId) return
    this.pointer = { x: event.clientX, y: event.clientY }
    if (this.subject || Math.hypot(event.clientX - press.x, event.clientY - press.y) < SLOP) return
    // A touch that moves before the hold is up is a scroll, not a drag.
    if (press.timer) this.#end()
    else this.#start()
  }

  #start() {
    const press = this.#press!
    clearTimeout(press.timer)
    press.timer = undefined
    press.home = pageBox(press.element)
    // Scaling the element in hand (see .lifted in app.css) keeps the picked-up point under the pointer.
    press.element.style.transformOrigin = `${press.x + scrollX - press.home.left}px ${press.y + press.scroll - press.home.top}px`
    press.element.setPointerCapture(press.pointerId)
    // A name being typed is saved before the cards move. Phones keep a field focused when the
    // page around it is touched.
    const focused = document.activeElement
    if (focused instanceof HTMLElement) focused.blur()
    addEventListener('keydown', this.#key)
    this.subject = press.id
    this.#frame = requestAnimationFrame(this.#tick)
  }

  // Each frame: scroll near the window's edges, then move the element with the pointer and
  // work out where it would land.
  #tick = () => {
    const press = this.#press!
    const { x, y } = this.pointer
    const speed = y < SCROLL_ZONE ? y - SCROLL_ZONE : Math.max(0, y - (innerHeight - SCROLL_ZONE))
    if (speed !== 0) scrollBy(0, Math.max(-SCROLL_ZONE, Math.min(SCROLL_ZONE, speed)) / 4)

    const dx = x - press.x
    const dy = y + scrollY - press.y - press.scroll
    press.element.style.translate = `${dx}px ${dy}px`
    const home = press.home!
    const dragged = { left: home.left + dx, right: home.right + dx, top: home.top + dy, bottom: home.bottom + dy }
    const drop = findDrop(dragged, home, this.#targets(press), this.#topItems(press))
    // Only a different drop updates the page.
    if (JSON.stringify(drop) !== JSON.stringify(this.drop)) this.drop = drop
    this.#frame = requestAnimationFrame(this.#tick)
  }

  // What the dragged element could land on: not itself or anything inside it. A group only moves
  // within the top level, and only a habit can become a stage.
  #targets(press: Press): Target[] {
    if (press.kind === 'group') return []
    const habit = press.kind === 'habit'
    return [...this.#board!.querySelectorAll<HTMLElement>('[data-drop]')].flatMap((element): Target[] => {
      if (press.element.contains(element)) return []
      const { drop, id, kind, group } = element.dataset
      const box = pageBox(element)
      if (drop === 'card') return [{ type: 'card', id: id!, box, groupId: group, into: habit && (kind === 'habit' || kind === 'staged') }]
      if (drop === 'stage') return habit ? [{ type: 'stage', id: id!, box }] : []
      return [{ type: 'group', id: id!, box }]
    })
  }

  #topItems(press: Press): Box[] {
    return [...this.#board!.querySelectorAll<HTMLElement>('[data-top]')].filter((element) => element !== press.element).map(pageBox)
  }

  #up = (event: PointerEvent) => {
    if (event.pointerId !== this.#press?.pointerId) return
    const drop = this.drop
    const id = this.subject
    this.#end()
    if (id && drop && drop.type !== 'stay') this.#onDrop(id, drop)
  }

  #cancel = (event: PointerEvent) => {
    if (event.pointerId === this.#press?.pointerId) this.#end()
  }

  #key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.#end()
  }

  #end() {
    const press = this.#press
    if (!press) return
    clearTimeout(press.timer)
    cancelAnimationFrame(this.#frame)
    press.element.style.translate = ''
    press.element.style.transformOrigin = ''
    removeEventListener('pointermove', this.#move)
    removeEventListener('pointerup', this.#up)
    removeEventListener('pointercancel', this.#cancel)
    removeEventListener('keydown', this.#key)
    this.#press = undefined
    this.subject = undefined
    this.drop = undefined
  }
}

function pageBox(element: Element): Box {
  const box = element.getBoundingClientRect()
  return { left: box.left + scrollX, right: box.right + scrollX, top: box.top + scrollY, bottom: box.bottom + scrollY }
}
