<script lang="ts">
  import { flushSync } from 'svelte'

  type Choice = { id: string; label: string; detail: string }
  type Request = { title: string; choices: Choice[] }

  let dialog: HTMLDialogElement
  let request = $state<Request>()
  let settle: (id: string | undefined) => void

  // Opens the dialog and resolves to the chosen id, or undefined when cancelled.
  export function choose(next: Request): Promise<string | undefined> {
    request = next
    // The choices have to be on the page before the dialog opens, so it can focus the first one.
    flushSync()
    dialog.showModal()
    return new Promise((resolve) => (settle = resolve))
  }

  function answer(id: string | undefined) {
    settle(id)
    dialog.close()
  }
</script>

<!-- Like ConfirmDialog, the answer comes from a button or Escape's cancel event, never the
     later close event. -->
<dialog bind:this={dialog} oncancel={() => settle(undefined)}>
  {#if request}
    <h2>{request.title}</h2>
    <ul>
      {#each request.choices as choice (choice.id)}
        <li>
          <button onclick={() => answer(choice.id)}>
            <span>{choice.label}</span>
            <small>{choice.detail}</small>
          </button>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button onclick={() => answer(undefined)}>Cancel</button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(24rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
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
    margin: 0 0 0.75rem;
    font-size: 1.15rem;
  }

  ul {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    text-align: left;
  }

  small {
    color: var(--ink-secondary);
    font-weight: normal;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
  }
</style>
