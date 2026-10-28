<script lang="ts">
  type Props = {
    // What was just logged, while it can still be taken back.
    message: string | undefined
    undo: () => void
  }
  let { message, undo }: Props = $props()
</script>

<!-- Always on the page, even empty, so screen readers announce each message as it arrives. -->
<div class="undo" role="status">
  {#if message}
    <div class="bar">
      <span>{message}</span>
      <button onclick={undo}>Undo</button>
    </div>
  {/if}
</div>

<style>
  /* Along the bottom, clear of an iPhone's home indicator. Only the bar itself takes taps. */
  .undo {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 4;
    display: flex;
    justify-content: center;
    padding: 0 1rem calc(1rem + env(safe-area-inset-bottom));
    pointer-events: none;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: 100%;
    padding: 0.25rem 0.25rem 0.25rem 1rem;
    border-radius: 0.875rem;
    background: var(--ink);
    color: var(--surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    pointer-events: auto;
  }

  .bar span {
    overflow-wrap: anywhere;
  }

  .bar button {
    border-color: transparent;
    background: none;
    color: inherit;
  }

  @media (hover: hover) {
    .bar button:hover {
      background: color-mix(in srgb, var(--surface) 15%, transparent);
    }
  }
</style>
