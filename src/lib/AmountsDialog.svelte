<script lang="ts">
  import { flushSync } from 'svelte'
  import { QUICK_AMOUNTS, quickAmounts } from '#lib/amounts.ts'

  type Request = { name: string; unit: string; amounts: number[] }

  let dialog: HTMLDialogElement
  let request = $state<Request>()
  let error = $state<string>()
  let settle: (amounts: number[] | undefined) => void

  // Opens the dialog and resolves to the amounts to save, or undefined when cancelled.
  export function edit(next: Request): Promise<number[] | undefined> {
    request = next
    error = undefined
    // The boxes have to be on the page before the dialog opens, so it can focus the first one.
    flushSync()
    dialog.showModal()
    return new Promise((resolve) => (settle = resolve))
  }

  function save(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const amounts = quickAmounts(new FormData(event.currentTarget).getAll('amount').map(String))
    if (typeof amounts === 'string') error = amounts
    else answer(amounts)
  }

  // Like ConfirmDialog, the answer comes from a button or Escape's cancel event, never the later
  // close event.
  function answer(amounts: number[] | undefined) {
    settle(amounts)
    dialog.close()
  }
</script>

<dialog bind:this={dialog} oncancel={() => settle(undefined)}>
  {#if request}
    <h2>Quick amounts for {request.name}</h2>
    <p>Each amount becomes a button that logs it with one tap. Leave a box empty for fewer buttons.</p>
    <form onsubmit={save}>
      <div class="boxes">
        {#each { length: QUICK_AMOUNTS }, i (i)}
          <input
            name="amount"
            type="number"
            inputmode="decimal"
            step="any"
            min="0"
            value={request.amounts[i] ?? ''}
            aria-label="Quick amount {i + 1} in {request.unit}"
            aria-invalid={error !== undefined}
            aria-describedby={error ? 'amounts-error' : undefined}
          />
        {/each}
        <span aria-hidden="true">{request.unit}</span>
      </div>
      {#if error}
        <p id="amounts-error" class="error" role="alert">{error}</p>
      {/if}
      <div class="actions">
        <button type="button" onclick={() => answer(undefined)}>Cancel</button>
        <button class="primary">Save</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  p {
    margin: 0.4rem 0 0;
    color: var(--ink-secondary);
  }

  form {
    display: grid;
    gap: 0.85rem;
    margin-top: 1rem;
  }

  .boxes {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    color: var(--ink-secondary);
  }

  input {
    width: 5rem;
    color: var(--ink);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
</style>
