import { createSignal } from "solid-js"
import type { QuestionRequest } from "../types/question"
import { getLogger } from "../lib/logger"

const log = getLogger("questions")

/**
 * Question queue management per instance
 * Similar to permission queue management pattern
 */

const [questionQueues, setQuestionQueues] = createSignal<Map<string, QuestionRequest[]>>(new Map())

/**
 * Get the queue of pending questions for an instance
 */
export function getQuestionQueue(instanceId: string): QuestionRequest[] {
    const queue = questionQueues().get(instanceId)
    if (!queue) {
        return []
    }
    return queue
}

/**
 * Get the first pending question for an instance (the one to show)
 */
export function getPendingQuestion(instanceId: string): QuestionRequest | null {
    const queue = getQuestionQueue(instanceId)
    return queue.length > 0 ? (queue[0] ?? null) : null
}

/**
 * Get the number of pending questions for an instance
 */
export function getQuestionQueueLength(instanceId: string): number {
    return getQuestionQueue(instanceId).length
}

/**
 * Add a question request to the queue
 */
export function addQuestionToQueue(instanceId: string, question: QuestionRequest): void {
    setQuestionQueues((prev) => {
        const next = new Map(prev)
        const queue = next.get(instanceId) ?? []

        // Don't add if already in queue
        if (queue.some((q) => q.id === question.id)) {
            return next
        }

        const updatedQueue = [...queue, question]
        next.set(instanceId, updatedQueue)
        return next
    })
}

/**
 * Add a question request to the queue with explicit source
 */
export function addQuestionToQueueWithSource(instanceId: string, question: QuestionRequest, source: 'opencode' | 'mcp'): void {
    addQuestionToQueue(instanceId, { ...question, source })
}

/**
 * Remove a question request from the queue
 */
export function removeQuestionFromQueue(instanceId: string, questionId: string): void {
    setQuestionQueues((prev) => {
        const next = new Map(prev)
        const queue = next.get(instanceId) ?? []
        const filtered = queue.filter((q) => q.id !== questionId)

        if (filtered.length > 0) {
            next.set(instanceId, filtered)
        } else {
            next.delete(instanceId)
        }
        return next
    })
}

/**
 * Clear all questions for an instance
 */
export function clearQuestionQueue(instanceId: string): void {
    setQuestionQueues((prev) => {
        const next = new Map(prev)
        next.delete(instanceId)
        return next
    })
}

/**
 * Handle question failure - move from active queue to failed notifications
 * This is KEY FIX for ensuring failed questions are properly dismissed
 */
export function handleQuestionFailure(
    instanceId: string,
    questionId: string,
    reason: "timeout" | "session-stop" | "cancelled",
    folderPath: string
): void {
    const queue = getQuestionQueue(instanceId)
    const question = queue.find((q) => q.id === questionId)

    if (question) {
        // Import on demand to avoid circular dependency and module load issues
        import("./failed-notifications").then(({ addFailedNotification }) => {
            // Step 1: Add to failed notifications (persistent storage)
            addFailedNotification({
                id: `failed-q-${Date.now()}`,
                type: "question",
                title: question.questions[0]?.question || "Question",
                reason,
                timestamp: Date.now(),
                instanceId,
                folderPath,
                questionData: {
                    questions: question.questions,
                    requestId: question.id
                }
            })
        }).catch((error) => {
            log.error("Failed to add question to failed notifications:", error)
        })

        // Step 2: CRITICAL - Remove from active queue
        // This ensures the notification badge disappears and it's not shown as "active" anymore
        removeQuestionFromQueue(instanceId, questionId)
    }
}

export { questionQueues }
