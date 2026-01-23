# Failed Notification Banner Enhancement

## Overview

Implement a persistent failed notification banner that captures `ask_user` and permission request failures (timeouts, session stops) and allows users to review and dismiss them individually or in bulk.

## Current Architecture

### Current UI State (Toolbar Section)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Session Toolbar                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Files]  [🛡️ 2]  [❓ 1]  [Command Palette]  Status  [≡]          │
│            ▲       ▲                                                │
│            │       │                                                │
│      Permission  Question                                           │
│       Banner     Banner                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Current Behavior:**
- **Permission Banner**: Shows active permission requests with badge count
- **Question Banner**: Shows active questions from `ask_user` tool with badge count
- **🐛 CURRENT BUG**: When timeout or session stop occurs:
  - Notifications **remain in active queue** (not auto-dismissed)
  - User loses context about what failed
  - No way to see failure history
  - **This is the primary issue we're fixing**

### Current Data Flow

```
┌─────────────────┐
│  MCP ask_user   │
│  Tool Call      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ PendingRequest  │─────▶│ Question Queue   │
│ Manager         │      │ (in-memory)      │
└────────┬────────┘      └──────────────────┘
         │
         │ Timeout/Cancel
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Returns:       │      │ Question Queue   │
│  timedOut: true │──▶   │ STILL HAS IT! ❌ │ ← BUG!
│  answered: false│      │ Not removed      │
└─────────────────┘      └──────────────────┘
         │
         └──▶ ❌ No persistence, no history, no cleanup

┌─────────────────┐
│  Permission     │
│  Request        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Permission Queue│
│ (in-memory)     │
└────────┬────────┘
         │
         │ Timeout/Session Stop
         ▼
┌─────────────────┐
│ Permission Queue│
│ STILL HAS IT! ❌│ ← BUG!
│ Not removed     │
└─────────────────┘
         │
         └──▶ ❌ No persistence, no cleanup, stays in queue forever
```

## Proposed Enhancement

### New UI State (Toolbar Section)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Session Toolbar                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Files]  [🛡️ 2]  [❓ 1]  [❌ 3]  [Command Palette]  Status  [≡]  │
│            ▲       ▲       ▲                                        │
│            │       │       └─── NEW: Failed Notification Badge     │
│      Permission  Question       (red badge with count)             │
│       Banner     Banner                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Failed Notification Panel (Expanded View)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Failed Notifications                           [Dismiss All] [✕]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🛡️ Permission: read_file                              [✕]  │   │
│  │ Pattern: /src/**/*.ts                                      │   │
│  │ Reason: Session timeout                                    │   │
│  │ Time: 2026-01-20 18:15:30                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ❓ Question: Select deployment target              [✕]     │   │
│  │ Reason: Request timeout                                    │   │
│  │ Time: 2026-01-20 18:10:15                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🛡️ Permission: write_file                             [✕]  │   │
│  │ Pattern: /config/*.json                                    │   │
│  │ Reason: Session stopped                                    │   │
│  │ Time: 2026-01-20 17:55:42                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### New Data Flow

```
┌─────────────────┐
│  MCP ask_user   │
│  Tool Call      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ PendingRequest  │─────▶│ Question Queue   │
│ Manager         │      │ (active)         │
└────────┬────────┘      └─────────┬────────┘
         │                         │
         │ Timeout/Cancel          │
         ▼                         │
┌─────────────────┐                │
│  Returns:       │                │
│  timedOut: true │                │
│  answered: false│                │
└────────┬────────┘                │
         │                         │
         │ ┌─────────────────────┐ │
         └▶│ 1. REMOVE from      │◀┘ ✅ KEY FIX!
           │    Question Queue   │
           │ 2. ADD to Failed    │
           │    Notifications    │
           └─────────┬───────────┘
                     │
                     ▼
           ┌──────────────────────┐
           │ Failed Notifications │
           │ Store (persistent)   │──▶ ✅ Persisted
           │ - localStorage       │
           │ - Auto-cleanup 5d    │
           └──────────┬───────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │ Failed Banner Badge  │
           │ (shows count)        │
           └──────────────────────┘

┌─────────────────┐
│  Permission     │
│  Request        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Permission Queue│
│ (active)        │
└────────┬────────┘
         │
         │ Timeout/Session Stop
         │
         │ ┌─────────────────────┐
         └▶│ 1. REMOVE from      │ ✅ KEY FIX!
           │    Permission Queue │
           │ 2. ADD to Failed    │
           │    Notifications    │
           └─────────┬───────────┘
                     │
                     ▼
           ┌──────────────────────┐
           │ Failed Notifications │
           │ Store (persistent)   │──▶ ✅ Persisted + Cleaned
           └──────────────────────┘
```

## Proposed Changes

### Storage Layer

#### [NEW] [failed-notifications-store.ts](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/stores/failed-notifications-store.ts)

**Purpose**: Manage failed notification state with localStorage persistence

**Key Features**:
- Store failed `ask_user` and permission request notifications
- Persist to localStorage for cross-session survival
- Auto-cleanup notifications older than 5 days
- Individual and bulk dismiss operations
- Expose count for badge display

**Schema**:
```typescript
interface FailedNotification {
  id: string                          // Unique ID
  type: 'question' | 'permission'     // Notification type
  title: string                       // Display title
  reason: 'timeout' | 'session-stop' | 'cancelled' // Failure reason
  timestamp: number                   // When it failed
  instanceId: string                  // Which instance
  
  // Type-specific data
  questionData?: {
    questions: QuestionInfo[]
    requestId: string
  }
  permissionData?: {
    permission: PermissionRequestLike
  }
}
```

**API**:
- `addFailedNotification(notification: FailedNotification): void`
- `removeFailedNotification(id: string): void`
- `dismissAllFailedNotifications(instanceId: string): void`
- `getFailedNotifications(instanceId: string): FailedNotification[]`
- `getFailedNotificationCount(instanceId: string): number`
- `cleanupOldNotifications(): void` // Run on init and periodically

---

### UI Components

#### [NEW] [failed-notification-banner.tsx](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/components/failed-notification-banner.tsx)

**Purpose**: Badge button in toolbar showing count of failed notifications

**Features**:
- Red badge style (distinct from active notification badges)
- Shows count (e.g., "3") or "9+" if > 9
- Click opens the failed notification panel
- Hidden when count is 0

**Visual Style**:
- Uses `X` icon or `AlertCircle` icon
- Red accent color to indicate failure state
- Similar positioning to existing permission/question banners

---

#### [NEW] [failed-notification-panel.tsx](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/components/failed-notification-panel.tsx)

**Purpose**: Modal/drawer showing list of failed notifications

**Features**:
- **Header**: Title + "Dismiss All" button + Close button
- **List**: Scrollable list of failed notification cards
- **Card Structure**:
  - Icon (🛡️ for permission, ❓ for question)
  - Title/summary
  - Reason (timeout, session-stop, cancelled)
  - Timestamp (formatted, e.g., "2 hours ago")
  - Individual dismiss [X] button
- **Empty State**: "No failed notifications" message

**Interactions**:
- Click [X] on card → dismiss that notification
- Click "Dismiss All" → dismiss all for this instance
- Click backdrop/close → close panel

---

#### [MODIFY] [instance-shell2.tsx](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/components/instance/instance-shell2.tsx)

**Changes**:
1. Import `FailedNotificationBanner` component
2. Add state for failed notification panel: `const [failedPanelOpen, setFailedPanelOpen] = createSignal(false)`
3. Add banner to toolbar (lines ~1458 and ~1548, next to existing banners):
   ```tsx
   <FailedNotificationBanner
     instanceId={props.instance.id}
     onClick={() => setFailedPanelOpen(true)}
   />
   ```
4. Add panel component at bottom (around line ~1710, next to other modals):
   ```tsx
   <FailedNotificationPanel
     instanceId={props.instance.id}
     isOpen={failedPanelOpen()}
     onClose={() => setFailedPanelOpen(false)}
   />
   ```

---

### Integration Points

#### [MODIFY] [questions.ts](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/stores/questions.ts)

**Changes**: Add failure detection and logging

When a question request is cancelled/times out, capture it:
```typescript
export function handleQuestionFailure(
  instanceId: string,
  questionId: string,
  reason: 'timeout' | 'session-stop' | 'cancelled'
): void {
  const question = getPendingQuestion(instanceId)
  if (question) {
    // Step 1: Add to failed notifications (persistent storage)
    addFailedNotification({
      id: `failed-q-${Date.now()}`,
      type: 'question',
      title: question.questions[0]?.question || 'Question',
      reason,
      timestamp: Date.now(),
      instanceId,
      questionData: {
        questions: question.questions,
        requestId: question.id
      }
    })
    
    // Step 2: CRITICAL - Remove from active queue
    // This ensures the notification badge disappears and it's not shown as "active" anymore
    removeQuestionFromQueue(instanceId, questionId)
  }
}
```

**CRITICAL**: The `removeQuestionFromQueue` call is essential. Without it, the question will:
- Stay in the active queue forever
- Show in the active question banner badge
- User sees duplicate state (active + failed)

Add calls to `handleQuestionFailure` in:
- Cancel handler (when user/session cancels)
- Timeout handler (when MCP request times out)
- Session stop events (when session is forcibly terminated)

---

#### [MODIFY] [instances.ts](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/stores/instances.ts)

**Changes**: Add permission failure detection

When a permission request fails, capture it:
```typescript
export function handlePermissionFailure(
  instanceId: string,
  permissionId: string,
  reason: 'timeout' | 'session-stop'
): void {
  const permission = getPermissionById(instanceId, permissionId)
  if (permission) {
    // Step 1: Add to failed notifications (persistent storage)
    addFailedNotification({
      id: `failed-p-${Date.now()}`,
      type: 'permission',
      title: getPermissionDisplayTitle(permission),
      reason,
      timestamp: Date.now(),
      instanceId,
      permissionData: { permission }
    })
    
    // Step 2: CRITICAL - Remove from active permission queue
    // This ensures the permission badge disappears and it's not shown as "active" anymore
    removePermission(instanceId, permissionId)
  }
}
```

**CRITICAL**: The `removePermission` call is essential. Without it, the permission will:
- Stay in the active queue forever
- Show in the active permission banner badge
- User sees duplicate state (active + failed)
- **This is the primary bug we're fixing!**

Add calls in session event handlers:
- Session timeout events
- Session stop events (when forcibly terminated)
- Manual cancellation events

---

#### [MODIFY] [pending.ts](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/mcp-server/src/pending.ts)

**Changes**: Emit failure events that UI can listen to

When rejecting a request with timeout/cancelled:
```typescript
reject(id: string, error: Error): boolean {
  const request = this.pending.get(id);
  if (!request) {
    return false;
  }

  // Clear timeout if set
  if (request.timeout) {
    clearTimeout(request.timeout);
  }

  const reason = error.message === 'Question timeout' ? 'timeout' : 
                 error.message === 'cancelled' ? 'cancelled' : 'session-stop';

  // Emit failure event for UI to capture
  this.emitFailure(id, reason);

  // ... rest of existing code
}
```

---

### Styling

#### [NEW] [failed-notification.css](file:///Users/muhammadfaiz/Custom%20APP/CodeNomad/packages/ui/src/styles/components/failed-notification.css)

**Purpose**: Styles for failed notification banner and panel

**Key Styles**:
- `.failed-notification-trigger`: Red-accented badge button
- `.failed-notification-badge`: Red badge styling
- `.failed-notification-panel`: Modal/drawer styles
- `.failed-notification-card`: Individual notification card
- `.failed-notification-card-dismiss`: Dismiss button styles
- Hover/focus states
- Responsive layout for mobile

---

## Verification Plan

### Automated Tests

No existing automated tests found for notification system. Manual verification will be primary approach.

### Manual Verification

#### Test 1: Question Timeout Scenario

1. Start the CodeNomad app in dev mode: `npm run dev`
2. Create a new session and trigger an `ask_user` tool call (via agent interaction or test script)
3. **Do not answer** the question - wait for timeout (check MCP server timeout config)
4. **Verify**:
   - ✅ Question disappears from active question banner
   - ✅ Failed notification badge appears with count "1"
   - ✅ Badge has red accent color
   - ✅ Click badge → panel opens showing the failed question
   - ✅ Panel shows reason: "Request timeout"
   - ✅ Timestamp is accurate
5. Click individual [X] dismiss button
6. **Verify**:
   - ✅ Card disappears
   - ✅ Badge count decrements
   - ✅ Panel closes when count reaches 0

#### Test 2: Permission Timeout Scenario

1. Trigger a permission request (e.g., file read/write)
2. **Do not respond** - wait for timeout
3. **Verify**:
   - ✅ Permission disappears from active permission banner
   - ✅ Failed notification badge appears/increments
   - ✅ Panel shows the failed permission with correct details
   - ✅ Reason shows "Session timeout" or appropriate message

#### Test 3: Session Stop Scenario

1. Start a session with pending questions/permissions
2. **Stop the session** (force close or session termination)
3. **Verify**:
   - ✅ Pending notifications move to failed state
   - ✅ Failed banner shows all failed items
   - ✅ Reason shows "Session stopped"

#### Test 4: Persistence Across App Restarts

1. Trigger multiple failed notifications (mix of questions and permissions)
2. **Close CodeNomad completely**
3. **Restart CodeNomad**
4. **Verify**:
   - ✅ Failed notification badge still shows correct count
   - ✅ Open panel → all failed notifications are still there
   - ✅ Timestamps and details are preserved

#### Test 5: Bulk Dismiss

1. Accumulate 3+ failed notifications
2. Open failed notification panel
3. Click "Dismiss All" button
4. **Verify**:
   - ✅ All cards disappear
   - ✅ Panel closes
   - ✅ Badge count goes to 0
   - ✅ localStorage is cleared

#### Test 6: Auto-Cleanup (5 Day Rule)

**Note**: This requires mocking the date or waiting 5 days. Suggest implementing a dev-only "Fast Forward Time" button for testing.

1. Create failed notifications in localStorage with old timestamps
2. Manually set timestamps to > 5 days ago in localStorage
3. Restart the app or trigger cleanup manually
4. **Verify**:
   - ✅ Old notifications are removed
   - ✅ Recent notifications (< 5 days) remain
   - ✅ Badge count is accurate

#### Test 7: Multi-Instance Isolation

1. Create 2 workspace instances
2. Generate failed notifications in both
3. **Verify**:
   - ✅ Each instance shows only its own failed notifications
   - ✅ Badge counts are independent
   - ✅ Dismiss in one instance doesn't affect the other

#### Test 8: UI Responsiveness (Mobile/Phone Layout)

1. Resize browser to phone width or test on mobile device
2. Trigger failed notifications
3. **Verify**:
   - ✅ Failed banner fits in toolbar without overflow
   - ✅ Panel is full-width and readable
   - ✅ Dismiss buttons are touch-friendly

---

## Implementation Notes

### Storage Format (localStorage)

```typescript
// Key: `codenomad:failed-notifications:${instanceId}`
// Value: JSON array of FailedNotification objects
[
  {
    "id": "failed-q-1737371730000",
    "type": "question",
    "title": "Select deployment target",
    "reason": "timeout",
    "timestamp": 1737371730000,
    "instanceId": "workspace-1",
    "questionData": {
      "questions": [...],
      "requestId": "req_123"
    }
  },
  // ... more notifications
]
```

### Auto-Cleanup Logic

- Run `cleanupOldNotifications()` on app boot
- Run periodically (e.g., every hour) via interval
- Filter out notifications where `Date.now() - timestamp > 5 * 24 * 60 * 60 * 1000` (5 days)

### Icon Choices

- **Failed Badge Icon**: `AlertCircle` from lucide-solid (red accent)
- **Question Failed Card**: `MessageCircleQuestion` icon
- **Permission Failed Card**: `ShieldAlert` icon

### Edge Cases

1. **What if the same notification fails multiple times?**
   - Use unique IDs with timestamp to allow duplicates
   - User can see history of multiple failures

2. **What if user clears localStorage manually?**
   - Failed notifications are lost (acceptable tradeoff)
   - No crash or errors

3. **What if instanceId changes?**
   - Old failed notifications remain under old key
   - Could add a global cleanup button in settings (future enhancement)

---

## Dependencies

- No new external dependencies required
- Uses existing:
  - SolidJS reactive primitives
  - lucide-solid icons
  - Existing CSS/theming system
  - localStorage Web API
