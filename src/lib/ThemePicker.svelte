<script lang="ts">
  // The colors live in app.css under [data-theme]; each swatch carries its theme's attribute,
  // so it shows that theme's own accent.
  const THEMES = [
    { id: 'orange', name: 'Orange' },
    { id: 'blue', name: 'Blue' },
    { id: 'purple', name: 'Purple' },
    { id: 'pink', name: 'Pink' },
  ]
  const KEY = 'accountability:theme'

  // Saved on this device. A first visit starts on the first theme.
  let theme = $state(THEMES.find((t) => t.id === localStorage.getItem(KEY))?.id ?? THEMES[0].id)

  // Runs before the page paints, so a saved theme never flashes the default first.
  $effect.pre(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(KEY, theme)
  })
</script>

<fieldset class="themes">
  <legend>Theme</legend>
  {#each THEMES as option (option.id)}
    <label class="theme" data-theme={option.id} title={option.name}>
      <input type="radio" name="theme" value={option.id} bind:group={theme} aria-label={option.name} />
      <span class="swatch" aria-hidden="true"></span>
    </label>
  {/each}
</fieldset>

<style>
  .themes {
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .themes legend {
    float: left;
    margin-right: 0.25rem;
    padding: 0;
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }

  /* 44px tap target around a smaller swatch. */
  .theme {
    position: relative;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    cursor: pointer;
  }

  .swatch {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--accent);
  }

  /* The radio stays focusable for keyboards while the swatch shows the choice. */
  .theme input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .theme:has(input:checked) .swatch {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }

  .theme:has(input:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }
</style>
