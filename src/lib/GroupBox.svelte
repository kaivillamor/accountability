<script lang="ts">
  import type { Snippet } from 'svelte'
  import { idsOf, type Card } from '#lib/arrange.ts'
  import Menu, { type MenuItem } from '#lib/Menu.svelte'
  import type { Entry, Group } from '#lib/model.ts'
  import Name from '#lib/Name.svelte'
  import { doneToday } from '#lib/stats.ts'
  import type { Mark } from '#lib/TrackerCard.svelte'

  type Props = {
    group: Group
    cards: Card[]
    entries: Entry[]
    now: number
    menu: MenuItem[]
    renaming: string | undefined
    rename: (id: string, name: string | undefined) => void
    toggle: () => void
    mark: (id: string) => Mark | undefined
    dragging: string | undefined
    // The group's cards.
    children: Snippet
  }
  let { group, cards, entries, now, menu, renaming, rename, toggle, mark, dragging, children }: Props = $props()
  const marked = $derived(mark(group.id))

  const done = $derived(
    cards.filter((card) => {
      const ids = idsOf(card)
      return doneToday(card.tracker, card.stages, entries.filter((e) => ids.includes(e.trackerId)), now)
    }).length,
  )
  const allDone = $derived(done === cards.length)
</script>

<!-- The data attributes are for drag and drop (see drag.svelte.ts). -->
<section
  class="group"
  class:lifted={dragging === group.id}
  class:drop-before={marked?.line === 'before'}
  class:drop-after={marked?.line === 'after'}
  class:drop-into={marked?.ring === 'into'}
  data-id={group.id}
  data-kind="group"
  data-top
  data-drag
  data-drop="group"
>
  <header>
    <span class="grip" data-grip aria-hidden="true"></span>
    <div class="title">
      <Name name={group.name} editing={renaming === group.id} onsave={(name) => rename(group.id, name)} />
      <p class="progress" class:met={allDone}>{allDone ? '✓ ' : ''}{done} of {cards.length} done today</p>
    </div>
    <button
      class="icon toggle"
      aria-expanded={!group.collapsed}
      aria-label="{group.collapsed ? 'Expand' : 'Collapse'} {group.name}"
      title={group.collapsed ? 'Expand' : 'Collapse'}
      onclick={toggle}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <Menu label="More for {group.name}" items={menu} />
  </header>
  <div
    class="meter"
    role="progressbar"
    aria-label="Done today in {group.name}"
    aria-valuemin={0}
    aria-valuemax={cards.length}
    aria-valuenow={done}
  >
    <div class:reached={allDone} style:--progress="{(done / cards.length) * 100}%"></div>
  </div>
  {#if !group.collapsed}
    {@render children()}
  {/if}
</section>

<style>
  /* A tray the group's cards sit in, a step off the page color in either mode. */
  .group {
    margin-block: 0.875rem;
    padding: 0.4rem 0.6rem 0.1rem;
    border: 1px solid var(--border);
    border-radius: 1.1rem;
    background: color-mix(in srgb, var(--ink) 3%, var(--page));
  }

  /* Collapsed, the meter is the last thing in the tray. */
  .group:has(> .meter:last-child) {
    padding-bottom: 0.75rem;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .title {
    flex: 1;
    min-width: 0;
  }

  .progress {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }

  .toggle svg {
    transition: rotate 0.2s;
  }

  .toggle[aria-expanded='false'] svg {
    rotate: -90deg;
  }

  .toggle path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .meter {
    margin: 0.35rem 0 0 1rem;
  }
</style>
