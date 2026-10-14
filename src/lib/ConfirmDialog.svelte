<script lang="ts">
  type Request = { title: string; message: string; confirmLabel: string; danger: boolean }

  let dialog: HTMLDialogElement
  let request = $state<Request>()
  let settle: (confirmed: boolean) => void

  // Opens the dialog and resolves to whether the user confirmed.
  export function ask(next: Request): Promise<boolean> {
    request = next
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
  dialog {
    box-sizing: border-box;
    width: min(24rem, calc(100vw - 2rem));
    padding: 1.25rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }

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
