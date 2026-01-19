---
applyTo: '**'
---

# Fork Metadata
- Original Repo: https://github.com/NeuralNomadsAI/CodeNomad.git
- Fork Repo: https://github.com/bizzkoot/CodeNomad
- Analysis Date: 2026-01-19
- Current Branch: upstream-merge-analysis-20260119
- Base Branch: dev
- Analysis From: upstream/main

# Divergence Summary
- Commits Behind Upstream: 30 commits
- Commits Ahead of Upstream: 30 commits
- Fork Custom Modifications: 92 files changed, 28,111 insertions(+), 4,582 deletions(-)

# Custom Modifications Registry

## Major Features Added in Fork
1. **ask_user MCP Tool** - Complete MCP server implementation with native ask_user functionality
2. **Chat Search Functionality** - Full-text search with highlighting and navigation
3. **Question Panel** - Multi-line support, markdown rendering, minimize functionality
4. **Source Control Panel** - Git integration with publish branch, delete untracked files
5. **Markdown Preview** - Modal preview for markdown files with icon support
6. **Auto-collapse Chat Input** - Automatic collapse on message send

## Modified Files (Fork-Specific)
### MCP Server Package (NEW)
- packages/mcp-server/* (entire package is custom)

### UI Components (Heavy Modifications)
- packages/ui/src/components/askquestion-wizard.tsx
- packages/ui/src/components/search-panel.tsx
- packages/ui/src/components/search-highlighted-text.tsx
- packages/ui/src/components/markdown-preview-modal.tsx
- packages/ui/src/components/markdown-preview-icon.tsx
- packages/ui/src/components/folder-tree-browser.tsx
- packages/ui/src/components/folder-tree-node.tsx
- packages/ui/src/components/source-control/source-control-panel.tsx
- packages/ui/src/components/question-notification-banner.tsx

### Stores (Custom Logic)
- packages/ui/src/stores/questions.ts
- packages/ui/src/stores/search-store.ts
- packages/ui/src/stores/git.ts

### Libraries (Custom Features)
- packages/ui/src/lib/mcp-bridge.ts
- packages/ui/src/lib/search-algorithm.ts
- packages/ui/src/lib/search-highlight.ts
- packages/ui/src/lib/section-expansion.ts
- packages/ui/src/lib/markdown-file-detector.ts
- packages/ui/src/lib/file-path-validator.ts

### Server Routes (Custom)
- packages/server/src/server/routes/git.ts

### Documentation
- dev-docs/askquestion-integration.md
- tasks/todo/ask-user-feature/*

## Files Modified in Both Fork and Upstream (CONFLICT ZONES)
1. **packages/ui/src/components/prompt-input.tsx** - Both modified heavily
2. **packages/ui/src/components/expand-button.tsx** - Both modified
3. **packages/ui/src/components/message-block.tsx** - Both modified
4. **packages/ui/src/components/tool-call.tsx** - Both modified
5. **packages/ui/src/lib/sse-manager.ts** - Both modified
6. **packages/ui/src/stores/instances.ts** - Both modified
7. **packages/electron-app/electron/main/main.ts** - Both modified (auth vs custom)
8. **packages/electron-app/electron/main/process-manager.ts** - Both modified

# Merge History
## 2026-01-19 - SUCCESSFUL UPSTREAM MERGE
- Strategy: Bulk merge with selective conflict resolution
- Branch: upstream-merge-analysis-20260119
- Merge Commit: f532220 (amended)
- User Decisions:
  1. Windows Support: ✅ YES - Included all Windows fixes
  2. Expand Chat: ✅ KEPT FORK - Skipped all 11 upstream expand commits
  3. Authentication: ✅ YES - Merged full authentication system (19 files)
  4. Question Tool: ✅ KEPT FORK - Skipped upstream's question tool, kept ask_user MCP
  5. Performance: ✅ YES - Merged performance optimization
  
- Execution Summary:
  - **Phase 1**: Bulk merge executed - 9 conflicts identified
  - **Phase 2**: Conflicts resolved:
    - Package files: Accepted upstream versions (0.7.1, 0.7.2)
    - Fork features: Kept expand-button, prompt-input, tool-call, sse-manager, question types
    - Manual merge: message-block.tsx (merged both changes)
    - Restored fork versions: 7 files that auto-merged but had upstream question tool refs
  - **Phase 3**: Removed upstream question tool references from auto-merged files
  - **Phase 4**: Validation passed - typecheck successful
  
- Conflicts Resolved: 9 files
  1. package-lock.json → THEIRS (regenerate)
  2. packages/opencode-config/package.json → THEIRS (v0.7.1)
  3. packages/ui/package.json → THEIRS (v0.7.2)
  4. expand-button.tsx → OURS (fork's auto-collapse)
  5. prompt-input.tsx → OURS (fork's implementation)
  6. message-block.tsx → MANUAL (merged both: perf + search)
  7. tool-call.tsx → OURS (fork's custom renderers)
  8. sse-manager.ts → OURS (fork's event handling)
  9. question.ts → OURS (fork's ask_user types)

- Files Restored to Fork Version (removed upstream question tool refs):
  1. permission-approval-modal.tsx
  2. permission-notification-banner.tsx
  3. sessions.ts
  4. instances.ts
  5. message-v2/bridge.ts
  6. session-events.ts
  7. session-api.ts

- Tests: ✅ PASSED
  - Typecheck: PASSED (UI + electron-app)
  - Build: PASSED (7.71s)
  - Runtime: PASSED (dev server running successfully)

## Post-Merge Fixes
- **2025-01-19**: Fixed fastify compatibility issue
  - Problem: @fastify/reply-from 12.5.0 required fastify 5.x
  - Solution: Downgraded to @fastify/reply-from 9.8.0 (compatible with fastify 4.28.1)
  - Commit: Fix committed to dev branch

## Merged Features
✅ **Authentication System** (commit 4063413)
  - 19 files added/modified
  - packages/server/src/auth/* (complete auth subsystem)
  - electron/main/main.ts (auth integration)
  - HTTP server routes for login/token

✅ **Windows Compatibility Fixes** (4 commits)
  - df9722c: Background processes via cmd.exe
  - dffa490: OpenCode binary validation
  - e567d35: Prefer .exe/.cmd candidates
  - 62f52fc: Spawn opencode shims via shells

✅ **Performance Optimizations** (commit 927e4e1)
  - Reduced session list churn
  - Message block invalidation improvements
  - Performance improvements in instance-shell2, message-block, session-list

✅ **Bug Fixes**
  - ae322c5: Go to Session navigation (partially - merged with fork's impl)
  - Various stability improvements

## Skipped Features (Fork Implementation Preserved)
❌ **Expand Chat Feature** (11 commits: f06359a through 7749225)
  - Reason: Fork has superior auto-collapse implementation
  - Fork feature: Auto-collapse on send, custom expand logic
  - Decision: Keep fork's implementation

❌ **Question Tool** (commit 72f420b + related)
  - Reason: Fork has comprehensive ask_user MCP tool
  - Fork feature: Native MCP server with ask_user implementation
  - Decision: Keep fork's ask_user MCP implementation
  - Action: Removed all upstream question tool references from auto-merged files

## Next Steps
1. **Test Build**: Run `npm run build` to ensure build succeeds
2. **Manual Testing**: Test authentication features, fork features (search, ask_user)
3. **Merge to Dev**: If tests pass, merge this branch back to dev:
   ```bash
   git checkout dev
   git merge upstream-merge-analysis-20260119
   ```
4. **Regenerate Lockfile**: Run `npm install` to clean up package-lock.json
5. **Push to Origin**: Push updated dev branch to fork

# Merge Patterns
## Safe Patterns
- Version bumps (package.json changes only)
- Documentation additions
- New files that don't conflict with fork
- Windows-specific fixes (we may not need these if macOS only)

## Risk Patterns
- prompt-input.tsx modifications (both sides changed)
- expand-button.tsx modifications (both sides changed)
- Electron main.ts changes (upstream added auth, fork added custom features)

## Upstream Features We May Not Need
- Windows shell fixes (if fork is macOS-only)
- Remote authentication (if fork doesn't need remote access)
