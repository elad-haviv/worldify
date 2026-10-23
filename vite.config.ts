import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';

function getCommitHash(): string {
  const envSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.COMMIT_REF ||
    process.env.SOURCE_COMMIT ||
    process.env.COOLIFY_COMMIT;
  if (envSha) return envSha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    // CI builds (e.g. Coolify nixpacks) have no .git directory and no commit env.
    // Ask GitHub for the branch HEAD instead — the app is served per-deployment,
    // so HEAD-of-branch at build time IS the deployed commit.
    try {
      return execSync(
        `curl -sf --max-time 8 "https://api.github.com/repos/elad-haviv/worldify/commits/master" | head -c 400 | grep -o '"sha": *"[0-9a-f]\\{40\\}"' | head -1 | cut -d'"' -f4 | cut -c1-7`
      ).toString().trim() || 'dev';
    } catch {
      return 'dev';
    }
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
  },
});
