import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: 'happy-dom',
    globals: true,
    environmentOptions: {
      happyDOM: {
        // happy-dom's own DOMParser.parseFromString() hardcodes evaluateScripts: true
        // (see node_modules/happy-dom/src/dom-parser/DOMParser.ts), unlike real browsers
        // where DOMParser output is inert. Without these settings, parsing our real X.com
        // fixtures (which contain <script>/<link rel=stylesheet|preload>) throws or fires
        // network requests that fail under this machine's DNS setup. These settings are
        // test-environment-only; production parsing code in src/parse/microdata.ts relies
        // on real-browser DOMParser semantics and needs no equivalent workaround.
        //
        // `handleDisabledFileLoadingAsSuccess` exists at runtime in happy-dom 15.11.7 (see
        // IOptionalBrowserSettings.ts) and is required to avoid a happy-dom bug where the
        // disabled-loading error path itself throws on a null window reference — but
        // vitest 2.1.9's bundled HappyDOMOptions type doesn't declare it yet, hence the cast.
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        } as Record<string, boolean>,
      },
    },
  },
})
