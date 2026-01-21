import { Show, createMemo, createEffect, type Component } from "solid-js"
import { AlertCircle } from "lucide-solid"
import { failedNotificationsMap, ensureLoaded, getStorageKeyForFolder } from "../stores/failed-notifications"

interface FailedNotificationBannerProps {
    folderPath: string
    onClick: () => void
}

const FailedNotificationBanner: Component<FailedNotificationBannerProps> = (props) => {
    // Debug log to see what folder path we're using
    createEffect(() => {
        if (import.meta.env.DEV) {
            console.log("[FailedNotificationBanner] Mounted with folderPath:", props.folderPath)
            console.log("[FailedNotificationBanner] folderPath type:", typeof props.folderPath)
            console.log("[FailedNotificationBanner] folderPath value:", JSON.stringify(props.folderPath))
            const storageKey = getStorageKeyForFolder(props.folderPath)
            console.log("[FailedNotificationBanner] Storage key:", storageKey)
        }
    })

    // Access signal directly for proper reactivity
    const count = createMemo(() => {
        ensureLoaded(props.folderPath)
        const map = failedNotificationsMap()
        const result = (map.get(props.folderPath) ?? []).length
        if (import.meta.env.DEV) {
            console.log("[FailedNotificationBanner] Computed count:", result, "for folder:", props.folderPath)
        }
        return result
    })
    const hasFailedNotifications = createMemo(() => count() > 0)
    const label = createMemo(() => {
        const num = count()
        return `${num} failed notification${num === 1 ? "" : "s"}`
    })

    // Debug logging
    createEffect(() => {
        const currentCount = count()
        if (import.meta.env.DEV) {
            console.log(`[FailedNotificationBanner] Current count: ${currentCount}, hasNotifications: ${hasFailedNotifications()}`)
        }
    })

    return (
        <Show when={hasFailedNotifications()}>
            <button
                type="button"
                class="failed-notification-trigger"
                onClick={props.onClick}
                aria-label={label()}
                title={label()}
            >
                <AlertCircle class="failed-notification-icon" aria-hidden="true" />
                <span class="failed-notification-count" aria-hidden="true">
                    {count() > 9 ? "9+" : count()}
                </span>
            </button>
        </Show>
    )
}

export default FailedNotificationBanner
