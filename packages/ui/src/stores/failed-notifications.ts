import { createSignal, untrack } from "solid-js"
import type { QuestionInfo } from "../types/question"
import type { PermissionRequestLike } from "../types/permission"
import { getLogger } from "../lib/logger"

const log = getLogger("failed-notifications")

/**
 * Failed notification types and interfaces
 */
export interface FailedNotification {
    id: string
    type: "question" | "permission"
    title: string
    reason: "timeout" | "session-stop" | "cancelled"
    timestamp: number
    instanceId: string
    questionData?: {
        questions: QuestionInfo[]
        requestId: string
    }
    permissionData?: {
        permission: PermissionRequestLike
    }
}

/**
 * Storage key prefix for localStorage
 */
const STORAGE_KEY_PREFIX = "codenomad:failed-notifications:"

/**
 * Auto-cleanup threshold in days
 * Can be configured via VITE_FAILED_NOTIFICATION_CLEANUP_DAYS env var
 */
const CLEANUP_DAYS = parseInt(globalThis.process?.env?.VITE_FAILED_NOTIFICATION_CLEANUP_DAYS ?? "5", 10)
const CLEANUP_THRESHOLD_MS = CLEANUP_DAYS * 24 * 60 * 60 * 1000

/**
 * In-memory store for reactive updates
 * Map: instanceId -> FailedNotification[]
 */
const [failedNotificationsMap, setFailedNotificationsMap] = createSignal<
    Map<string, FailedNotification[]>
>(new Map())

// Track which instances have been loaded to prevent infinite loops
const loadedInstances = new Set<string>()

/**
 * Load failed notifications from localStorage for an instance
 */
function loadFromStorage(instanceId: string): FailedNotification[] {
    try {
        const key = `${STORAGE_KEY_PREFIX}${instanceId}`
        const stored = localStorage.getItem(key)
        if (!stored) {
            return []
        }
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) ? parsed : []
    } catch (error) {
        log.error(`Failed to load notifications for ${instanceId}:`, error)
        return []
    }
}

/**
 * Save failed notifications to localStorage for an instance
 */
function saveToStorage(instanceId: string, notifications: FailedNotification[]): void {
    try {
        const key = `${STORAGE_KEY_PREFIX}${instanceId}`
        if (notifications.length === 0) {
            localStorage.removeItem(key)
        } else {
            localStorage.setItem(key, JSON.stringify(notifications))
        }
    } catch (error) {
        log.error(`Failed to save notifications for ${instanceId}:`, error)
    }
}

/**
 * Ensure instance is loaded in memory
 * Uses separate Set to prevent reactive tracking of the load status itself
 */
function ensureLoaded(instanceId: string): void {
    if (loadedInstances.has(instanceId)) return

    // Mark as loaded immediately to prevent concurrent triggers
    loadedInstances.add(instanceId)

    untrack(() => {
        setFailedNotificationsMap((prev) => {
            const next = new Map(prev)
            if (!next.has(instanceId)) {
                next.set(instanceId, loadFromStorage(instanceId))
            }
            return next
        })
    })
}

/**
 * Add a failed notification
 */
export function addFailedNotification(notification: FailedNotification): void {
    ensureLoaded(notification.instanceId)

    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        const list = next.get(notification.instanceId) ?? []

        // Add new notification to the end
        const updated = [...list, notification]
        next.set(notification.instanceId, updated)

        // Persist to localStorage
        saveToStorage(notification.instanceId, updated)

        return next
    })
}

/**
 * Remove a failed notification by ID
 */
export function removeFailedNotification(instanceId: string, notificationId: string): void {
    ensureLoaded(instanceId)

    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        const list = next.get(instanceId) ?? []

        // Filter out the notification
        const filtered = list.filter((n) => n.id !== notificationId)

        if (filtered.length > 0) {
            next.set(instanceId, filtered)
        } else {
            next.delete(instanceId)
        }

        // Persist to localStorage
        saveToStorage(instanceId, filtered)

        return next
    })
}

/**
 * Dismiss all failed notifications for an instance
 */
export function dismissAllFailedNotifications(instanceId: string): void {
    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        next.delete(instanceId)

        // Clear from localStorage
        saveToStorage(instanceId, [])

        return next
    })
}

/**
 * Get all failed notifications for an instance
 * CRITICAL: Returns snapshot without creating reactive dependencies
 */
export function getFailedNotifications(instanceId: string): FailedNotification[] {
    ensureLoaded(instanceId)
    return failedNotificationsMap().get(instanceId) ?? []
}

/**
 * Get count of failed notifications for an instance
 */
export function getFailedNotificationCount(instanceId: string): number {
    return getFailedNotifications(instanceId).length
}

/**
 * Clean up notifications older than 5 days
 * Call this on app boot and periodically
 */
export function cleanupOldNotifications(): void {
    // Safety check: only run in browser environment
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
        return
    }

    try {
        const now = Date.now()
        const threshold = now - CLEANUP_THRESHOLD_MS

        // Get all instance IDs from localStorage
        const instanceIds = new Set<string>()
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(STORAGE_KEY_PREFIX)) {
                const instanceId = key.substring(STORAGE_KEY_PREFIX.length)
                instanceIds.add(instanceId)
            }
        }

        // Clean up old notifications in each instance
        instanceIds.forEach((instanceId) => {
            const notifications = loadFromStorage(instanceId)
            const filtered = notifications.filter((n) => n.timestamp > threshold)

            if (filtered.length !== notifications.length) {
                // Some were removed, update storage
                saveToStorage(instanceId, filtered)

                // Update in-memory if loaded
                setFailedNotificationsMap((prev) => {
                    const next = new Map(prev)
                    if (filtered.length > 0) {
                        next.set(instanceId, filtered)
                    } else {
                        next.delete(instanceId)
                    }
                    return next
                })

                log.debug(
                    `Cleaned up ${notifications.length - filtered.length} old notifications for ${instanceId}`
                )
            }
        })
    } catch (error) {
        log.error("Failed to cleanup old notifications:", error)
    }
}

/**
 * Initialize cleanup on module load
 */
if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    // Delay initial cleanup to avoid blocking module load
    setTimeout(() => {
        cleanupOldNotifications()
        // Run cleanup every hour
        setInterval(cleanupOldNotifications, 60 * 60 * 1000)
    }, 1000)
}

export { failedNotificationsMap }
