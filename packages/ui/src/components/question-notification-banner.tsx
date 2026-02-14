import { Show, createMemo, type Component } from "solid-js"
import { MessageCircleQuestion } from "lucide-solid"
import { getQuestionQueueLength } from "../stores/questions"

interface QuestionNotificationBannerProps {
    instanceId: string
    onClick: () => void
}

const QuestionNotificationBanner: Component<QuestionNotificationBannerProps> = (props) => {
    const queueLength = createMemo(() => getQuestionQueueLength(props.instanceId))
    const hasQuestions = createMemo(() => queueLength() > 0)
    const label = createMemo(() => {
        const count = queueLength()
        return `${count} question${count === 1 ? "" : "s"} pending`
    })

    return (
        <Show when={hasQuestions()}>
            <button
                type="button"
                class="permission-center-trigger"
                onClick={props.onClick}
                aria-label={label()}
                title={label()}
            >
                <MessageCircleQuestion class="permission-center-icon" aria-hidden="true" />
                <span class="permission-center-count" aria-hidden="true">
                    {queueLength() > 9 ? "9+" : queueLength()}
                </span>
            </button>
        </Show>
    )
}

export default QuestionNotificationBanner
