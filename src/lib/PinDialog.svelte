<script lang="ts" module>
  export type Answer = 'done' | 'cancelled' | 'forgot'
</script>

<script lang="ts">
  import { flushSync } from 'svelte'
  import { PIN } from '#lib/hidden.ts'

  type Request = {
    title: string
    message: string
    confirmLabel: string
    // `new` asks for a PIN twice; `existing` asks once and offers a way out if it's forgotten.
    mode: 'new' | 'existing'
    // Uses the PIN. A returned message keeps the dialog open to try again.
    submit: (pin: string) => Promise<string | undefined>
  }

  let dialog: HTMLDialogElement
  let request = $state<Request>()
  let pin = $state('')
  let again = $state('')
  let error = $state<string>()
  let working = $state(false)
  let settle: (answer: Answer) => void
  const mismatch = $derived(request?.mode === 'new' && again.length === 4 && again !== pin)
  const ready = $derived(PIN.test(pin) && (request?.mode === 'existing' || again === pin))

  // Opens the dialog and resolves once the PIN worked, or the user backed out.
  export function ask(next: Request): Promise<Answer> {
    request = next
    flushSync()
    dialog.showModal()
    return new Promise((resolve) => (settle = resolve))
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    working = true
    try {
      error = await request!.submit(pin)
    } finally {
      working = false
    }
    if (error === undefined) answer('done')
  }

  // Like ConfirmDialog, the answer comes from a button or Escape's cancel event, never the later
  // close event, and the PIN doesn't outlive the dialog.
  function answer(result: Answer) {
    settle(result)
    dialog.close()
  }

  function reset() {
    pin = again = ''
    error = undefined
  }
</script>

<dialog bind:this={dialog} oncancel={() => settle('cancelled')} onclose={reset}>
  {#if request}
    <h2>{request.title}</h2>
    <p>{request.message}</p>
    <form onsubmit={submit}>
      <!-- Digits only, with the number pad on phones. -->
      <label class="field">
        <span>PIN <small>4 digits</small></span>
        <input
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="4"
          autocomplete={request.mode === 'new' ? 'new-password' : 'current-password'}
          bind:value={pin}
          aria-invalid={error !== undefined}
          aria-describedby={error ? 'pin-error' : undefined}
        />
      </label>
      {#if request.mode === 'new'}
        <label class="field">
          <span>PIN again</span>
          <input
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            autocomplete="new-password"
            bind:value={again}
            aria-invalid={mismatch}
          />
          {#if mismatch}
            <small class="error">The PINs don't match.</small>
          {/if}
        </label>
      {/if}
      {#if error}
        <p id="pin-error" class="error" role="alert">{error}</p>
      {/if}
      <div class="actions">
        {#if request.mode === 'existing'}
          <button type="button" class="forgot" onclick={() => answer('forgot')}>Forgot it?</button>
        {/if}
        <button type="button" onclick={() => answer('cancelled')}>Cancel</button>
        <button class="primary" disabled={!ready || working}>{working ? 'Checking…' : request.confirmLabel}</button>
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

  /* Sized for 4 digits, spaced out so each one reads on its own. */
  input {
    width: 8rem;
    letter-spacing: 0.4em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  /* A quiet way out, apart from the main choices. */
  .forgot {
    margin-right: auto;
    padding: 0 0.25rem;
    border-color: transparent;
    background: none;
    color: var(--ink-secondary);
    font-weight: 500;
    text-decoration: underline;
  }
</style>
