<script lang="ts">
  type Props = {
    // Whether this browser has anything to bring into the installed app.
    hasData: boolean
  }
  let { hasData }: Props = $props()

  const KEY = 'accountability:install-hint-dismissed'

  // Opened from the Home Screen, the page has no browser around it.
  const installed = matchMedia('(display-mode: standalone)').matches
  // The hint is for phones and tablets, where Add to Home Screen exists.
  const touch = matchMedia('(pointer: coarse)').matches
  let dismissed = $state(localStorage.getItem(KEY) !== null)

  // An installed app asks the browser to keep its data, so low storage can't clear it. The browser
  // decides without asking anyone, and may say no; an exported file stays the backup.
  if (installed) navigator.storage.persist()

  function dismiss() {
    localStorage.setItem(KEY, 'yes')
    dismissed = true
  }
</script>

{#if touch && !installed && !dismissed}
  <section class="card install" aria-labelledby="install-title">
    <h2 id="install-title">Open it like an app</h2>
    <p>In your browser's Share or ⋯ menu, choose <strong>Add to Home Screen</strong>.</p>
    {#if hasData}
      <p class="note">
        The app keeps its own data, separate from this browser. Export here under "Move to another device" and Import in the app.
      </p>
    {/if}
    <button onclick={dismiss}>Got it</button>
  </section>
{/if}

<style>
  .install p {
    margin: 0.25rem 0 0.75rem;
  }

  .note {
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }
</style>
