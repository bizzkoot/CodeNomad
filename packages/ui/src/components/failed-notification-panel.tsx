import { Show, For, createMemo, createSignal, type Component } from "solid-js"
import { Dialog } from "@kobalte/core"
import { X, MessageCircleQuestion, ShieldAlert, ChevronDown, ChevronUp } from "lucide-solid"
import {
    failedNotificationsMap,
    ensureLoaded,
    removeFailedNotification,
    dismissAllFailedNotifications,
    type FailedNotification,
} from "../stores/failed-notifications"
import { getPermissionDisplayTitle, getPermissionKind, getPermissionPatterns } from "../types/permission"
import { Markdown } from "./markdown"
import type { TextPart } from "../types/message"

interface FailedNotificationPanelProps {
    folderPath: string
    isOpen: boolean
    onClose: () => void
}

const FailedNotificationPanel: Component<FailedNotificationPanelProps> = (props) => {
    // Track which notifications are expanded
    const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set())

    // Access signal directly for proper reactivity
    const notifications = createMemo(() => {
        ensureLoaded(props.folderPath)
        const map = failedNotificationsMap()
        return map.get(props.folderPath) ?? []
    })
    const hasNotifications = createMemo(() => notifications().length > 0)

    const isExpanded = (id: string) => expandedIds().has(id)

    const toggleExpanded = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const handleDismiss = (notificationId: string) => {
        removeFailedNotification(props.folderPath, notificationId)
        // Close panel if no more notifications (check in next tick after state updates)
        queueMicrotask(() => {
            if (notifications().length === 0) {
                props.onClose()
            }
        })
    }

    const handleDismissAll = () => {
        dismissAllFailedNotifications(props.folderPath)
        props.onClose()
    }

    const formatTimestamp = (timestamp: number): string => {
        const now = Date.now()
        const diff = now - timestamp
        const seconds = Math.floor(diff / 1000)
        const minutes = Math.floor(seconds / 60)
        const hours = Math.floor(minutes / 60)
        const days = Math.floor(hours / 24)

        if (seconds < 60) {
            return "just now"
        } else if (minutes < 60) {
            return `${minutes}m ago`
        } else if (hours < 24) {
            return `${hours}h ago`
        } else {
            return `${days}d ago`
        }
    }

    const getReasonLabel = (reason: FailedNotification["reason"]): string => {
        switch (reason) {
            case "timeout":
                return "Request timeout"
            case "session-stop":
                return "Session stopped"
            case "cancelled":
                return "Cancelled"
            default:
                return reason
        }
    }

    const getTitleForNotification = (notification: FailedNotification): string => {
        if (notification.type === "question" && notification.questionData) {
            return notification.questionData.questions[0]?.question || "Question"
        } else if (notification.type === "permission" && notification.permissionData) {
            return getPermissionDisplayTitle(notification.permissionData.permission)
        }
        return notification.title
    }

    const createTextPart = (id: string, text: string): TextPart => ({
        id: `${id}-text`,
        type: "text",
        text,
    })

    return (
        <Dialog.Root open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay class="failed-notification-overlay" />
                <div class="failed-notification-positioner">
                    <Dialog.Content class="failed-notification-panel">
                        <div class="failed-notification-header">
                            <Dialog.Title class="failed-notification-title">Failed Notifications</Dialog.Title>
                            <div class="failed-notification-header-actions">
                                <Show when={hasNotifications()}>
                                    <button
                                        type="button"
                                        class="failed-notification-dismiss-all"
                                        onClick={handleDismissAll}
                                    >
                                        Dismiss All
                                    </button>
                                </Show>
                                <Dialog.CloseButton class="failed-notification-close">
                                    <X size={20} />
                                </Dialog.CloseButton>
                            </div>
                        </div>

                        <div class="failed-notification-content">
                            <Show
                                when={hasNotifications()}
                                fallback={
                                    <div class="failed-notification-empty">
                                        <p>No failed notifications</p>
                                    </div>
                                }
                            >
                                <div class="failed-notification-list">
                                    <For each={notifications()}>
                                        {(notification) => {
                                            const expanded = createMemo(() => isExpanded(notification.id))
                                            return (
                                                <div class="failed-notification-card">
                                                    <div class="failed-notification-card-icon">
                                                        <Show
                                                            when={notification.type === "question"}
                                                            fallback={<ShieldAlert size={20} />}
                                                        >
                                                            <MessageCircleQuestion size={20} />
                                                        </Show>
                                                    </div>
                                                    <div class="failed-notification-card-content">
                                                        <div class="failed-notification-card-header">
                                                            <div class="failed-notification-card-title">
                                                                {getTitleForNotification(notification)}
                                                            </div>
                                                            <div class="failed-notification-card-meta">
                                                                <span class="failed-notification-card-reason">
                                                                    {getReasonLabel(notification.reason)}
                                                                </span>
                                                                <span class="failed-notification-card-separator">•</span>
                                                                <span class="failed-notification-card-time">
                                                                    {formatTimestamp(notification.timestamp)}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <Show when={expanded()}>
                                                            <div class="failed-notification-card-details">
                                                                <Show when={notification.type === "question" && notification.questionData}>
                                                                    <For each={notification.questionData!.questions}>
                                                                        {(q, index) => (
                                                                            <div class="failed-notification-card-question-section">
                                                                                <div class="failed-notification-card-question-label">Question</div>
                                                                                <div class="failed-notification-card-question-text">
                                                                                    <Markdown
                                                                                        part={createTextPart(`${notification.id}-${index()}`, q.question)}
                                                                                        size="sm"
                                                                                        disableHighlight
                                                                                    />
                                                                                </div>
                                                                                <Show when={q.options?.length > 0}>
                                                                                    <div class="failed-notification-card-question-label" style={{ "margin-top": "8px" }}>Options</div>
                                                                                    <ul class="failed-notification-card-options">
                                                                                        <For each={q.options}>
                                                                                            {(opt) => (
                                                                                                <li class="failed-notification-card-option">
                                                                                                    <span class="failed-notification-card-option-label">{opt.label}</span>
                                                                                                    <Show when={opt.description}>
                                                                                                        <span class="failed-notification-card-option-desc">{opt.description}</span>
                                                                                                    </Show>
                                                                                                </li>
                                                                                            )}
                                                                                        </For>
                                                                                    </ul>
                                                                                </Show>
                                                                            </div>
                                                                        )}
                                                                    </For>
                                                                </Show>

                                                                <Show when={notification.type === "permission" && notification.permissionData}>
                                                                    <div class="failed-notification-card-permission">
                                                                        <div class="failed-notification-card-permission-row">
                                                                            <span class="failed-notification-card-permission-label">Type:</span>
                                                                            <span class="failed-notification-card-permission-value">
                                                                                {getPermissionKind(notification.permissionData!.permission)}
                                                                            </span>
                                                                        </div>
                                                                        <div class="failed-notification-card-permission-row">
                                                                            <span class="failed-notification-card-permission-label">Resources:</span>
                                                                            <div class="failed-notification-card-patterns">
                                                                                <For each={getPermissionPatterns(notification.permissionData!.permission)}>
                                                                                    {(pattern) => (
                                                                                        <div class="failed-notification-card-pattern">{pattern}</div>
                                                                                    )}
                                                                                </For>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </Show>
                                                            </div>
                                                        </Show>
                                                    </div>

                                                    <div style={{ display: "flex", gap: "4px" }}>
                                                        <button
                                                            type="button"
                                                            class="failed-notification-card-expand"
                                                            onClick={() => toggleExpanded(notification.id)}
                                                            aria-label={expanded() ? "Collapse details" : "Expand details"}
                                                            data-expanded={expanded()}
                                                        >
                                                            <Show when={expanded()} fallback={<ChevronDown size={16} />}>
                                                                <ChevronUp size={16} />
                                                            </Show>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            class="failed-notification-card-dismiss"
                                                            onClick={() => handleDismiss(notification.id)}
                                                            aria-label="Dismiss"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        }}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    </Dialog.Content>
                </div>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

export default FailedNotificationPanel
