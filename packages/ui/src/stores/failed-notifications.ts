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
    folderPath: string
    questionData?: {
        questions: QuestionInfo[]
        requestId: string
    }
    permissionData?: {
        permission: PermissionRequestLike
    }
}

/**
 * Generate a stable hash from folder path for persistent storage
 * Uses a simple hash function to convert folder path to a stable string key
 */
export function getStorageKeyForFolder(folderPath: string): string {
    let hash = 0
    for (let i = 0; i < folderPath.length; i++) {
        const char = folderPath.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
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
 * Map: folderPath -> FailedNotification[]
 */
const [failedNotificationsMap, setFailedNotificationsMap] = createSignal<
    Map<string, FailedNotification[]>
>(new Map())

// Track which instances have been loaded to prevent infinite loops
const loadedInstances = new Set<string>()

/**
 * Load failed notifications from localStorage for a folder path
 */
function loadFromStorage(folderPath: string): FailedNotification[] {
    try {
        const storageKey = `${STORAGE_KEY_PREFIX}${getStorageKeyForFolder(folderPath)}`
        const stored = localStorage.getItem(storageKey)
        if (!stored) {
            log.debug(`No notifications found in localStorage for ${folderPath} (key: ${storageKey})`)
            return []
        }
        const parsed = JSON.parse(stored)
        const result = Array.isArray(parsed) ? parsed : []
        log.debug(`Loaded ${result.length} notifications from localStorage for ${folderPath}`)
        return result
    } catch (error) {
        log.error(`Failed to load notifications for ${folderPath}:`, error)
        return []
    }
}

/**
 * Save failed notifications to localStorage for a folder path
 */
function saveToStorage(folderPath: string, notifications: FailedNotification[]): void {
    try {
        console.log(`[FailedNotifications] saveToStorage called for folder: ${folderPath}`)
        console.log(`[FailedNotifications] saveToStorage: ${notifications.length} notifications to save`)
        
        const storageKey = `${STORAGE_KEY_PREFIX}${getStorageKeyForFolder(folderPath)}`
        console.log(`[FailedNotifications] saveToStorage: storageKey = ${storageKey}`)
        
        if (notifications.length === 0) {
            console.log(`[FailedNotifications] saveToStorage: removing key (0 notifications)`)
            localStorage.removeItem(storageKey)
        } else {
            const json = JSON.stringify(notifications)
            console.log(`[FailedNotifications] saveToStorage: saving ${json.length} bytes to localStorage`)
            localStorage.setItem(storageKey, json)
            console.log(`[FailedNotifications] saveToStorage: saved! localStorage.length now = ${localStorage.length}`)
        }
    } catch (error) {
        console.error(`[FailedNotifications] saveToStorage ERROR:`, error)
        log.error(`Failed to save notifications for ${folderPath}:`, error)
    }
}

/**
 * Ensure folder is loaded in memory
 * Updates the signal reactively so components can track changes
 */
export function ensureLoaded(folderPath: string): void {
    if (loadedInstances.has(folderPath)) return

    // Mark as loaded immediately to prevent concurrent triggers
    loadedInstances.add(folderPath)

    // Load without untrack so reactive components can pick up the initial state
    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        if (!next.has(folderPath)) {
            const stored = loadFromStorage(folderPath)
            next.set(folderPath, stored)
            log.debug(`Loaded ${stored.length} notifications from storage for ${folderPath}`)
        }
        return next
    })
}

/**
 * Add a failed notification
 */
export function addFailedNotification(notification: FailedNotification): void {
    ensureLoaded(notification.folderPath)

    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        const list = next.get(notification.folderPath) ?? []

        // Add new notification to the end
        const updated = [...list, notification]
        next.set(notification.folderPath, updated)

        // Persist to localStorage
        saveToStorage(notification.folderPath, updated)

        return next
    })
}

/**
 * Remove a failed notification by ID
 */
export function removeFailedNotification(folderPath: string, notificationId: string): void {
    ensureLoaded(folderPath)

    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        const list = next.get(folderPath) ?? []

        // Filter out the notification
        const filtered = list.filter((n) => n.id !== notificationId)

        if (filtered.length > 0) {
            next.set(folderPath, filtered)
        } else {
            next.delete(folderPath)
        }

        // Persist to localStorage
        saveToStorage(folderPath, filtered)

        return next
    })
}

/**
 * Dismiss all failed notifications for a folder
 */
export function dismissAllFailedNotifications(folderPath: string): void {
    setFailedNotificationsMap((prev) => {
        const next = new Map(prev)
        next.delete(folderPath)

        // Clear from localStorage
        saveToStorage(folderPath, [])

        return next
    })
}

/**
 * Get all failed notifications for a folder
 * REACTIVE: Tracks changes to the failedNotificationsMap signal
 */
export function getFailedNotifications(folderPath: string): FailedNotification[] {
    ensureLoaded(folderPath)
    // Access the signal to create reactive tracking
    const map = failedNotificationsMap()
    return map.get(folderPath) ?? []
}

/**
 * Get count of failed notifications for a folder
 * REACTIVE: Tracks changes to the failedNotificationsMap signal
 */
export function getFailedNotificationCount(folderPath: string): number {
    ensureLoaded(folderPath)
    // Access the signal to create reactive tracking
    const map = failedNotificationsMap()
    return (map.get(folderPath) ?? []).length
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

        // Get all folder paths from localStorage
        const folderPaths = new Set<string>()
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key?.startsWith(STORAGE_KEY_PREFIX)) {
                // Extract folder paths from notifications to rebuild the list
                const stored = localStorage.getItem(key)
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored)
                        if (Array.isArray(parsed)) {
                            parsed.forEach((n) => {
                                if (n.folderPath) {
                                    folderPaths.add(n.folderPath)
                                }
                            })
                        }
                    } catch (error) {
                        // Ignore parse errors, cleanup will handle stale keys
                    }
                }
            }
        }

        // Clean up old notifications in each folder
        folderPaths.forEach((folderPath) => {
            const notifications = loadFromStorage(folderPath)
            const filtered = notifications.filter((n) => n.timestamp > threshold)

            if (filtered.length !== notifications.length) {
                // Some were removed, update storage
                saveToStorage(folderPath, filtered)

                // Update in-memory if loaded
                setFailedNotificationsMap((prev) => {
                    const next = new Map(prev)
                    if (filtered.length > 0) {
                        next.set(folderPath, filtered)
                    } else {
                        next.delete(folderPath)
                    }
                    return next
                })

                log.debug(
                    `Cleaned up ${notifications.length - filtered.length} old notifications for ${folderPath}`
                )
            }
        })
    } catch (error) {
        log.error("Failed to cleanup old notifications:", error)
    }
}

/**
 * Preload all failed notifications from localStorage on app startup
 * This ensures notifications are available before components mount
 */
export function preloadAllNotifications(): void {
    // Safety check: only run in browser environment
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
        console.log("[FailedNotifications] Cannot preload - window or localStorage not available")
        return
    }

    try {
        console.log("[FailedNotifications] Starting preload...")
        console.log("[FailedNotifications] localStorage length:", localStorage.length)
        console.log("[FailedNotifications] STORAGE_KEY_PREFIX:", STORAGE_KEY_PREFIX)

        log.debug("Starting notification preload...")
        const folderPaths = new Set<string>()
        const oldKeysToKeep: Array<{key: string, notifications: FailedNotification[]}> = []

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            console.log(`[FailedNotifications] Checking key ${i}: ${key}`)
            if (key?.startsWith(STORAGE_KEY_PREFIX)) {
                const stored = localStorage.getItem(key)
                if (stored) {
                    console.log(`[FailedNotifications] Found storage key: ${key}`)
                    try {
                        const parsed = JSON.parse(stored)
                        if (Array.isArray(parsed)) {
                            parsed.forEach((n) => {
                                if (n.folderPath) {
                                    // New format - has folderPath, extract and use
                                    folderPaths.add(n.folderPath)
                                    console.log(`[FailedNotifications] Found new format for folder: ${n.folderPath}`)
                                    log.debug(`Found new format notifications for folder: ${n.folderPath}`)
                                } else if (n.instanceId) {
                                    // Old format - has instanceId but no folderPath
                                    // We'll load these for display but can't persist them
                                    console.log(`[FailedNotifications] Found old format with instanceId: ${n.instanceId}`)
                                    log.debug(`Found old format notification (instanceId: ${n.instanceId})`)
                                }
                            })
                            // Keep old format notifications in memory for display
                            if (parsed.some((n) => !n.folderPath && n.instanceId)) {
                                oldKeysToKeep.push({ key, notifications: parsed as FailedNotification[] })
                            }
                        }
                    } catch (error) {
                        log.warn(`Failed to parse notifications from key ${key}:`, error)
                    }
                }
            }
        }

        console.log(`[FailedNotifications] Found ${folderPaths.size} folders with new format`)
        console.log(`[FailedNotifications] Found ${oldKeysToKeep.length} old format entries`)

        // Load all folders into memory
        const notificationsToLoad = new Map<string, FailedNotification[]>()
        folderPaths.forEach((folderPath) => {
            if (!loadedInstances.has(folderPath)) {
                const notifications = loadFromStorage(folderPath)
                notificationsToLoad.set(folderPath, notifications)
                loadedInstances.add(folderPath)
                log.debug(`Loaded ${notifications.length} notifications for ${folderPath}`)
            }
        })

        console.log(`[FailedNotifications] Loading ${notificationsToLoad.size} folders into map`)

        if (notificationsToLoad.size > 0 || oldKeysToKeep.length > 0) {
            setFailedNotificationsMap((prev) => {
                const next = new Map(prev)

                // Load new format notifications by folder path
                notificationsToLoad.forEach((notifications, folderPath) => {
                    next.set(folderPath, notifications)
                })

                // Load old format notifications by instance ID (for display only)
                oldKeysToKeep.forEach(({ key, notifications }) => {
                    const instanceId = key.substring(STORAGE_KEY_PREFIX.length)
                    if (!next.has(instanceId)) {
                        next.set(instanceId, notifications)
                    }
                })

                console.log(`[FailedNotifications] Map now has ${next.size} entries`)
                return next
            })

            const totalCount = Array.from(notificationsToLoad.values()).reduce(
                (sum, arr) => sum + arr.length,
                0
            )
            const oldCount = oldKeysToKeep.reduce(
                (sum, item) => sum + item.notifications.length,
                0
            )
            console.log(`[FailedNotifications] Preloaded ${totalCount} new + ${oldCount} old notifications`)
            log.debug(`Preloaded ${totalCount} new + ${oldCount} old notifications for ${notificationsToLoad.size} folders + ${oldKeysToKeep.length} instance IDs`)

            setTimeout(() => {
                const map = failedNotificationsMap()
                console.log(`[FailedNotifications] After preload, map contains ${map.size} entries:`, Array.from(map.keys()))
                log.debug(`After preload, map contains ${map.size} entries:`, Array.from(map.keys()))
            }, 100)
        } else {
            console.log("[FailedNotifications] No notifications to load")
        }
    } catch (error) {
        console.error("[FailedNotifications] Preload error:", error)
        log.error("Failed to preload notifications:", error)
    }
}

/**
 * Initialize cleanup on module load
 */
if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    // Run cleanup periodically (every hour)
    // Preload is done in main.tsx before app renders
    setInterval(cleanupOldNotifications, 60 * 60 * 1000)
}

export { failedNotificationsMap }
