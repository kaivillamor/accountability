<script lang="ts" module>
  export type MenuItem = { label: string; run: () => void; critical?: boolean }
</script>

<script lang="ts">
  let { label, items }: { label: string; items: MenuItem[] } = $props()
  const id = $props.id()
  let button: HTMLButtonElement

  // Opens under the button, or above it when there's more room there, lined up with the
  // button's right edge. Page coordinates, so it scrolls along with the button.
  function place(event: ToggleEvent & { currentTarget: HTMLElement }) {
    if (event.newState !== 'open') return
    const box = button.getBoundingClientRect()
    const below = innerHeight - box.bottom >= Math.min(box.top, 240)
    const menu = event.currentTarget
    menu.style.top = `${(below ? box.bottom + 4 : box.top - 4) + scrollY}px`
    menu.style.right = `${document.documentElement.clientWidth - box.right}px`
    menu.style.translate = below ? '' : '0 -100%'
  }
</script>

<button class="icon" bind:this={button} popovertarget={id} aria-label={label} title="More">
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <circle cx="5" cy="12" r="1.75" />
    <circle cx="12" cy="12" r="1.75" />
    <circle cx="19" cy="12" r="1.75" />
  </svg>
</button>

<!-- A popover: it sits above everything else and closes on Escape or a click outside it. -->
<div {id} popover="auto" class="menu" onbeforetoggle={place}>
  {#each items as item (item.label)}
    <button class:critical={item.critical} popovertarget={id} popovertargetaction="hide" onclick={item.run}>{item.label}</button>
  {/each}
</div>

<style>
  svg circle {
    fill: currentColor;
  }

  .menu {
    position: absolute;
    inset: auto;
    margin: 0;
    min-width: 12rem;
    padding: 0.3rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }

  .menu button {
    display: block;
    width: 100%;
    border: 0;
    background: none;
    font-weight: 500;
    text-align: left;
  }

  .menu .critical {
    color: var(--critical);
  }
</style>
