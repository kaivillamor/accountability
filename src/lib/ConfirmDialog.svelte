<script lang="ts">
  import { flushSync } from 'svelte'

  type Request = { title: string; message: string; confirmLabel: string; danger: boolean }

  let dialog: HTMLDialogElement
  let request = $state<Request>()
  let settle: (confirmed: boolean) => void

  // Opens the dialog and resolves to whether the user confirmed.
  export function ask(next: Request): Promise<boolean> {
    request = next
    // The buttons have to be on the page before the dialog opens, or the first question after a
    // page load focuses the dialog itself instead of Cancel.
    flushSync()
    dialog.showModal()
    return new Promise((resolve) => (settle = resolve))
  }

  function answer(confirmed: boolean) {
    settle(confirmed)
    dialog.close()
  }
</script>

<!-- Drawn by the app instead of the browser's own confirm(). Cancel gets focus first, so
     Enter can't confirm by accident, and Escape counts as Cancel. The answer is taken from the
     button or the Escape key's cancel event, never the later close event, which can arrive
     after the next question has already opened. -->
<dialog bind:this={dialog} oncancel={() => settle(false)}>
  {#if request}
    <h2>{request.title}</h2>
    <p>{request.message}</p>
    <div class="actions">
      <button onclick={() => answer(false)}>Cancel</button>
      <button class={request.danger ? 'danger' : 'primary'} onclick={() => answer(true)}>{request.confirmLabel}</button>
    </div>
  {/if}
</dialog>

<style>
  h2 {
    margin: 0 0 0.4rem;
    font-size: 1.15rem;
  }

  p {
    margin: 0;
    color: var(--ink-secondary);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.25rem;
  }
</style>
