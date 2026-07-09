import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Stable per-build identifier: prefer the git commit SHA (matches what actually
// ships), fall back to a timestamp for non-git builds. Baked into the client via
// __BUILD_ID__ and mirrored into version.json so connected browsers can detect a
// new deploy and auto-refresh.
function resolveBuildId(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execSync('git rev-parse HEAD').toString().trim()
  } catch {
    return `ts-${Date.now()}`
  }
}

const BUILD_ID = resolveBuildId()

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      // Emit /version.json into the build output so every client can poll it and
      // reload when the deployed build id no longer matches the running one.
      name: 'casa-version-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ version: BUILD_ID, builtAt: new Date().toISOString() }),
        })
      },
    },
  ],
})
