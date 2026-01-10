import { createSignal } from "solid-js"
import type { QuestionRequest } from "../types/question"

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

export { questionQueues }
