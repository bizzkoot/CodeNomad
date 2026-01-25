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
## 2026-01-25 - SUCCESSFUL UPSTREAM SYNC v0.9.1
- **Strategy**: Incremental conflict resolution with strategic file preservation
- **Branch**: merge/mirror-to-dev-20260125
- **Merge Commit**: fa5b125
- **Upstream Source**: origin/mirror (20 commits from v0.9.0 → v0.9.1)
- **Fork State**: Preserved all custom features (ask_user MCP, search, failed notifications)

### Execution Summary
- **Phase 1**: Branch analysis and divergence identification (20 commits each side)
- **Phase 2**: Merge execution with 11 conflicts detected
- **Phase 3**: Strategic conflict resolution:
  - Safe changes: Version bumps, configs, workflows (committed first)
  - Critical files: Kept fork versions of permission-approval-modal.tsx, tool-call.tsx
  - Hybrid merge: session-events.ts (removed question tool refs, kept upstream structure)
- **Phase 4**: Build validation and fixes:
  - Initial build: Failed (rollup issue)
  - Fix: `rm -rf node_modules package-lock.json && npm install`
  - Final build: ✅ PASSED (8.31s)
- **Phase 5**: Typecheck resolution:
  - Issue: mcp-server .d.ts files not being generated
  - Root cause: Corrupt tsconfig.tsbuildinfo + moduleResolution: "bundler"
  - Fix: Changed to moduleResolution: "node", added types field, clean rebuild
  - Result: ✅ All typechecks pass (UI + electron-app)

### Conflicts Resolved (11 total)
1. **package.json** → THEIRS (v0.9.1)
2. **packages/*/package.json** (5 files) → THEIRS (version bumps)
3. **.gitignore** → MANUAL (merged temp/ + .codenomad/, .tmp/)
4. **.github/workflows/reusable-release.yml** → THEIRS (added release-ui, publish-server)
5. **packages/ui/src/components/permission-approval-modal.tsx** → OURS (preserve ask_user MCP)
6. **packages/ui/src/components/tool-call.tsx** → OURS (preserve section expansion + ask_user rendering)
7. **packages/ui/src/stores/session-events.ts** → MANUAL (removed question tool refs, kept upstream structure)
8. **package-lock.json** → REGENERATED (9751 insertions, 4372 deletions)

### Strategic Decisions

#### Ask_user vs. Question Tool
**Conflict**: Upstream refactored tool-call.tsx into modular components (ansi-render, diff-render, question-block, permission-block) tightly coupled with their question tool.

**Decision**: Keep fork's tool-call.tsx (1050 lines)

**Rationale**:
- Fork's ask_user MCP tool is fundamentally different and more robust:
  - Complete MCP server package with JSON-RPC
  - Native Electron IPC bridge with zero-cost routing
  - Automatic Claude Desktop registration
  - Persistent failed notification handling
- Upstream's question tool is a simple UI component without MCP integration
- Fork version also includes custom section expansion feature (search integration)

**Files Affected**:
- ✅ Kept fork: tool-call.tsx, permission-approval-modal.tsx
- ✅ Modified: session-events.ts (removed reconcilePendingQuestionsV2)

### Merged Upstream Features (v0.9.1)

✅ **New Packages & Infrastructure**
- Cloudflare package (remote UI hosting)
- UI auto-update system (version.json manifest)
- Release workflows (release-ui, publish-server CI/CD)

✅ **UI Enhancements**
- GitHub stars display with brand-icons component
- Version pill component for UI version info
- Enhanced folder picker layout
- Task UI improvements (steps/model headers, prompt/output panes, ANSI support)
- Multi-file diff rendering for apply_patch tool
- Modular tool-call components (we use some, kept our tool-call.tsx)

✅ **Server & API**
- Filesystem API: create-folder endpoint
- Remote UI support: auto-update via manifest
- Process management: improved workspace cleanup
- UI version serving: emit ui-version.json
- Enhanced path handling for @file mentions

✅ **Performance & Bug Fixes**
- Session list optimization (reduced churn)
- Message block performance (better invalidation)
- Permission UX improvements
- Server --host binding configuration

### Fork Features Preserved

✅ **ask_user MCP Tool** (Complete Implementation)
- packages/mcp-server/* (native MCP server)
- MCP bridge initialization and cleanup
- Question wizard with multi-line support
- Failed notifications with retry logic
- Automatic Claude Desktop registration

✅ **Custom Features**
- Section expansion (search integration)
- Search functionality (chat search with highlighting)
- Custom tool-call rendering and section expansion
- MCP IPC bridge (zero-cost routing)

### Build Validation
| Check | Status | Notes |
|-------|--------|-------|
| UI typecheck | ✅ PASSED | No TypeScript errors |
| electron-app typecheck | ✅ PASSED | Fixed by regenerating .d.ts files |
| Build | ✅ PASSED | 8.31s compile time |
| Dev server | ✅ PASSED | All features functional |

### Test Verification
All fork features tested and working:
- ✅ MCP bridge initialization
- ✅ ask_user tool (question wizard)
- ✅ Failed notifications loading
- ✅ Section expansion
- ✅ Search functionality
- ✅ No runtime errors

### Post-Merge Fixes

**2026-01-25**: Fixed electron-app typecheck errors
- **Problem**: mcp-server .d.ts declaration files not being generated
- **Root Cause**: 
  - Corrupt incremental build cache (tsconfig.tsbuildinfo)
  - moduleResolution: "bundler" incompatible with TypeScript 5.9.3
- **Solution**:
  - Changed tsconfig.json: moduleResolution "bundler" → "node"
  - Added "types" field to package.json: "dist/server.d.ts"
  - Clean rebuild: `rm tsconfig.tsbuildinfo && tsc`
- **Result**: ✅ All typechecks pass, .d.ts files properly generated
- **Commit**: 011a70e

### Files Changed
- **60 files total**: +6,611 lines, -1,192 lines
- **New files (13)**: Cloudflare package, UI components, remote UI system
- **Modified files (47)**: UI components, server routes, configs, lockfiles

### Documentation
- **PR.md**: Comprehensive dev→main merge documentation created

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
