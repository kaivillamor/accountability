<script lang="ts">
  type Props = {
    name: string
    // Shows a text field in place of the name.
    editing: boolean
    // The new name, or undefined to keep the old one (Escape, or an empty field).
    onsave: (name: string | undefined) => void
    tag?: 'h2' | 'span'
  }
  let { name, editing, onsave, tag = 'h2' }: Props = $props()
  let cancelled = false
</script>

{#if editing}
  <!-- Enter or leaving the field saves; Escape keeps the old name. -->
  <input
    class="rename"
    value={name}
    aria-label="Rename {name}"
    {@attach (input) => {
      cancelled = false
      input.focus()
      input.select()
    }}
    onkeydown={(event) => {
      if (event.key === 'Escape') cancelled = true
      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
    }}
    onblur={(event) => onsave(cancelled ? undefined : event.currentTarget.value.trim() || undefined)}
  />
{:else}
  <svelte:element this={tag} class="name">{name}</svelte:element>
{/if}

<style>
  .name {
    margin: 0;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  span.name {
    font-size: 1rem;
  }

  .rename {
    width: 100%;
    min-width: 0;
    font-weight: 700;
  }
</style>
