import { resolve } from 'path'

// Demos import the packages by name; resolve them to sources (not dist)
// so edits hot-reload without a rebuild.
const pkg = (p: string) => resolve(__dirname, 'packages', p)

export const packageAliases = [
  { find: /^@daniluk\/liquid-glass$/, replacement: pkg('core/src/index.ts') },
  { find: /^@daniluk\/liquid-glass-react$/, replacement: pkg('react/src/index.ts') },
  { find: /^@daniluk\/liquid-glass-angular$/, replacement: pkg('angular/src/public-api.ts') },
]
