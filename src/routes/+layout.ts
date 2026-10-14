// The app's font, bundled with the build so no third-party server is contacted.
import '@fontsource-variable/figtree'

// Pages render only in the browser. The server can't read the end-to-end
// encrypted data, so it has nothing to render.
export const ssr = false
