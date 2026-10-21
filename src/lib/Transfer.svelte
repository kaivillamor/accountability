<script lang="ts">
  import { arrange, idsOf, type Card } from '#lib/arrange.ts'
  import type { Snapshot } from '#lib/model.ts'
  import { count } from '#lib/text.ts'
  import { lock, merge, originOf, unlock, without, type Origin } from '#lib/transfer.ts'

  type Props = {
    // What's on this device now.
    current: () => Snapshot
    // Saves an import's result in place of everything on this device.
    onimport: (snapshot: Snapshot) => Promise<void>
    // Nothing to export yet.
    empty: boolean
  }
  let { current, onimport, empty }: Props = $props()

  const MIN_LENGTH = 8
  const ORIGINS: Record<Origin, string> = { both: 'On both', file: 'From the file', here: 'Only here' }

  let working = $state(false)

  // Export: a passphrase, typed twice, locks a file to share or download.
  let exportDialog: HTMLDialogElement
  let passphrase = $state('')
  let again = $state('')
  let file = $state<File>()
  let url = ''
  const mismatch = $derived(again !== '' && again !== passphrase)
  const canShare = $derived(file !== undefined && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }))

  async function createFile(event: SubmitEvent) {
    event.preventDefault()
    working = true
    const text = await lock(current(), passphrase)
    working = false
    passphrase = again = ''
    const today = new Date()
    const date = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((n) => String(n).padStart(2, '0')).join('-')
    file = new File([text], `accountability-${date}.json`, { type: 'application/json' })
    url = URL.createObjectURL(file)
  }

  function download() {
    const link = document.createElement('a')
    link.href = url
    link.download = file!.name
    link.click()
  }

  async function share() {
    try {
      await navigator.share({ files: [file!], title: 'Accountability data' })
    } catch (error) {
      // Closing the share sheet without picking anything isn't a problem.
      if ((error as Error).name !== 'AbortError') throw error
    }
  }

  // Passphrases and the file don't outlive the dialog.
  function resetExport() {
    passphrase = again = ''
    URL.revokeObjectURL(url)
    file = undefined
  }

  // Import: a file and its passphrase, then a review of the combined trackers before saving.
  let importDialog: HTMLDialogElement
  let chosen = $state<File>()
  let importPassphrase = $state('')
  let error = $state<string>()
  // Raw state: the review never changes once made, and its records go straight into the database,
  // which can't store Svelte's reactive proxies.
  let review = $state.raw<{ here: Snapshot; file: Snapshot; merged: Snapshot }>()
  // Cards the user chose to delete while reviewing.
  let deleting = $state<string[]>([])

  async function openFile(event: SubmitEvent) {
    event.preventDefault()
    working = true
    error = undefined
    try {
      const fromFile = await unlock(await chosen!.text(), importPassphrase)
      const here = current()
      review = { here, file: fromFile, merged: merge(here, fromFile, Date.now()) }
      importPassphrase = ''
    } catch (failure) {
      // The messages from `unlock` are written for the user.
      error = (failure as Error).message
    } finally {
      working = false
    }
  }

  // Each card of the combined data, in page order, with what's in it and where it came from.
  const rows = $derived.by(() => {
    if (!review) return []
    const { here, file: fromFile, merged } = review
    const cards = arrange(merged.trackers, merged.groups).flatMap((item): { card: Card; group?: string }[] =>
      item.type === 'group' ? item.cards.map((card) => ({ card, group: item.group.name })) : [{ card: item.card }],
    )
    return cards.map(({ card, group }) => {
      const ids = idsOf(card)
      const logged = merged.entries.filter((e) => ids.includes(e.trackerId)).length
      const details = [card.stages.length > 0 ? count(card.stages.length, 'stage') : '', `logged ${count(logged, 'time')}`, group ? `in ${group}` : '']
      return { id: card.tracker.id, name: card.tracker.name, details: details.filter((d) => d !== '').join(' · '), origin: originOf(card.tracker.id, here, fromFile) }
    })
  })

  // Like "2 from the file, 1 only on this device and 5 on both devices".
  const summary = $derived.by(() => {
    const where: Record<Origin, string> = { file: 'from the file', here: 'only on this device', both: 'on both devices' }
    const parts = (['file', 'here', 'both'] as const)
      .map((origin) => ({ origin, n: rows.filter((row) => row.origin === origin).length }))
      .filter(({ n }) => n > 0)
      .map(({ origin, n }) => `${n} ${where[origin]}`)
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
  })

  async function finish() {
    await onimport(without(review!.merged, deleting, Date.now()))
    importDialog.close()
  }

  function resetImport() {
    chosen = undefined
    importPassphrase = ''
    error = undefined
    review = undefined
    deleting = []
  }
</script>

<section class="card">
  <h2>Move to another device</h2>
  <p>Everything stays on this device. To move it, export a file locked with a passphrase, then import it on your other device.</p>
  <div class="actions">
    <button onclick={() => exportDialog.showModal()} disabled={empty}>Export</button>
    <button onclick={() => importDialog.showModal()}>Import</button>
  </div>
</section>

<dialog bind:this={exportDialog} onclose={resetExport}>
  {#if file}
    <h2>Your file is ready</h2>
    <p>Send <strong>{file.name}</strong> to your other device, then choose Import there and type the passphrase.</p>
    <div class="actions">
      <button onclick={() => exportDialog.close()}>Done</button>
      <button class:primary={!canShare} onclick={download}>Download</button>
      {#if canShare}
        <button class="primary" onclick={share}>Share…</button>
      {/if}
    </div>
  {:else}
    <h2>Export your data</h2>
    <p>Choose a passphrase to lock the file. You'll type it on the other device. If it's forgotten, the file can't be opened.</p>
    <form onsubmit={createFile}>
      <label class="field">
        <span>Passphrase <small>at least {MIN_LENGTH} characters</small></span>
        <input type="password" autocomplete="new-password" bind:value={passphrase} />
      </label>
      <label class="field">
        <span>Passphrase again</span>
        <input type="password" autocomplete="new-password" bind:value={again} aria-invalid={mismatch} aria-describedby={mismatch ? 'mismatch' : undefined} />
        {#if mismatch}
          <small id="mismatch" class="error">The passphrases don't match.</small>
        {/if}
      </label>
      <div class="actions">
        <button type="button" onclick={() => exportDialog.close()}>Cancel</button>
        <button class="primary" disabled={passphrase.length < MIN_LENGTH || again !== passphrase || working}>
          {working ? 'Locking…' : 'Create file'}
        </button>
      </div>
    </form>
  {/if}
</dialog>

<dialog bind:this={importDialog} onclose={resetImport}>
  {#if review}
    <h2>Review before importing</h2>
    <p>{summary}. Everything logged on either device is kept, unless you delete its tracker here.</p>
    <ul class="review">
      {#each rows as row (row.id)}
        <li>
          <div class="what">
            <strong>{row.name}</strong>
            <small>{ORIGINS[row.origin]} · {row.details}</small>
          </div>
          <div class="keep" role="radiogroup" aria-label="Keep or delete {row.name}">
            <label>
              <input type="radio" name="keep-{row.id}" checked={!deleting.includes(row.id)} onchange={() => (deleting = deleting.filter((id) => id !== row.id))} />
              Keep
            </label>
            <label>
              <input type="radio" name="keep-{row.id}" checked={deleting.includes(row.id)} onchange={() => (deleting = [...deleting, row.id])} />
              Delete
            </label>
          </div>
        </li>
      {/each}
    </ul>
    <div class="actions">
      <button onclick={() => importDialog.close()}>Cancel</button>
      <button class="primary" onclick={finish}>
        {deleting.length > 0 ? `Import and delete ${count(deleting.length, 'tracker')}` : 'Import'}
      </button>
    </div>
  {:else}
    <h2>Import data</h2>
    <p>Choose a file exported from your other device and type its passphrase. You'll see everything before it's saved.</p>
    <form onsubmit={openFile}>
      <label class="field">
        <span>File</span>
        <input type="file" accept=".json,application/json" onchange={(event) => (chosen = event.currentTarget.files?.[0])} />
      </label>
      <label class="field">
        <span>Passphrase</span>
        <input type="password" autocomplete="current-password" bind:value={importPassphrase} />
      </label>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
      <div class="actions">
        <button type="button" onclick={() => importDialog.close()}>Cancel</button>
        <button class="primary" disabled={!chosen || importPassphrase === '' || working}>{working ? 'Unlocking…' : 'Open'}</button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  h2 {
    margin: 0;
    font-size: 1.1rem;
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

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  section .actions {
    justify-content: flex-start;
  }

  form .actions {
    margin-top: 0.25rem;
  }

  .review {
    display: grid;
    margin: 1rem 0 0;
    padding: 0;
    border-top: 1px solid var(--border);
    list-style: none;
  }

  .review li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .what {
    display: grid;
    min-width: 0;
  }

  .what small {
    color: var(--ink-secondary);
  }

  /* Two side-by-side choices, each a 44px tap target. */
  .keep {
    display: flex;
    gap: 0.25rem;
  }

  .keep label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.75rem;
    padding: 0 0.7rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .keep label:has(input:checked) {
    border-color: var(--accent);
    background: var(--tint);
  }

  .keep label:last-child:has(input:checked) {
    border-color: var(--critical);
    background: color-mix(in srgb, var(--critical) 10%, transparent);
  }

  .keep input {
    margin: 0;
  }
</style>
