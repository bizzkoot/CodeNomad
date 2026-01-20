import { Show, For, createMemo, type Component } from "solid-js"
import { Dialog } from "@kobalte/core"
import { X, MessageCircleQuestion, ShieldAlert } from "lucide-solid"
import {
    getFailedNotifications,
    removeFailedNotification,
    dismissAllFailedNotifications,
    type FailedNotification,
} from "../stores/failed-notifications"
import { getPermissionDisplayTitle } from "../types/permission"

interface FailedNotificationPanelProps {
    instanceId: string
    isOpen: boolean
    onClose: () => void
}

const FailedNotificationPanel: Component<FailedNotificationPanelProps> = (props) => {
    const notifications = createMemo(() => getFailedNotifications(props.instanceId))
    const hasNotifications = createMemo(() => notifications().length > 0)

    const handleDismiss = (notificationId: string) => {
        removeFailedNotification(props.instanceId, notificationId)
        // Close panel if no more notifications
        if (getFailedNotifications(props.instanceId).length === 0) {
            props.onClose()
        }
    }

    const handleDismissAll = () => {
        dismissAllFailedNotifications(props.instanceId)
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
                                        {(notification) => (
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
                                                <button
                                                    type="button"
                                                    class="failed-notification-card-dismiss"
                                                    onClick={() => handleDismiss(notification.id)}
                                                    aria-label="Dismiss"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        )}
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
