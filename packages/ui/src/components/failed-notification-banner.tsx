import { Show, createMemo, type Component } from "solid-js"
import { AlertCircle } from "lucide-solid"
import { getFailedNotificationCount } from "../stores/failed-notifications"

interface FailedNotificationBannerProps {
    instanceId: string
    onClick: () => void
}

const FailedNotificationBanner: Component<FailedNotificationBannerProps> = (props) => {
    const count = createMemo(() => getFailedNotificationCount(props.instanceId))
    const hasFailedNotifications = createMemo(() => count() > 0)
    const label = createMemo(() => {
        const num = count()
        return `${num} failed notification${num === 1 ? "" : "s"}`
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
