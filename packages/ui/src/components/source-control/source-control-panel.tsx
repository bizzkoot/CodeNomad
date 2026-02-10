import { Component, Show, For, createSignal, createEffect, onMount, onCleanup } from "solid-js"
import { ChevronDown, RefreshCw, GitBranch, Plus, Minus, Undo2, Check, UploadCloud, X, Sparkles } from "lucide-solid"
import type { GitFileChange } from "../../../../server/src/api-types"
import {
    useGitStore,
    fetchGitBranches,
    stageFiles,
    unstageFiles,
    discardChanges,
    deleteFiles,
    commitChanges,
    checkoutBranch,
    refreshGit,
    pushChanges,
} from "../../stores/git"
import { serverApi } from "../../lib/api-client"
import { serverEvents } from "../../lib/server-events"
import { createSession, deleteSession } from "../../stores/sessions"
import { instances } from "../../stores/instances"
import { getDefaultModel } from "../../stores/session-models"
import { messageStoreBus } from "../../stores/message-v2/bus"

interface SourceControlPanelProps {
    workspaceId: string
}

const SourceControlPanel: Component<SourceControlPanelProps> = (props) => {
    const git = useGitStore(props.workspaceId)
    const [commitMessage, setCommitMessage] = createSignal("")
    const [expandedSections, setExpandedSections] = createSignal<string[]>(["staged", "changes", "untracked"])
    const [showDiff, setShowDiff] = createSignal(false)
    const [diffContent, setDiffContent] = createSignal("")
    const [diffPath, setDiffPath] = createSignal("")
    const [isFileContent, setIsFileContent] = createSignal(false)
    const [showBranchPicker, setShowBranchPicker] = createSignal(false)
    const [isGeneratingCommit, setIsGeneratingCommit] = createSignal(false)
    let commitTextareaRef: HTMLTextAreaElement | undefined

    onMount(() => {
        refreshGit(props.workspaceId)

        // 1. Listen for internal tool events (Safe: uses observer pattern, supports multiple listeners)
        const cleanupServerEvents = serverEvents.on("instance.event", (payload) => {
            // TS Error Fix: Narrow the type to the specific union member that has 'event'
            // We know it's "instance.event" because we filtered for it in .on()
            const instanceEvent = payload as Extract<typeof payload, { type: "instance.event" }>
            const innerEvent = instanceEvent.event as any
            const partType = innerEvent?.properties?.part?.type

            if (partType === "tool" || partType === "patch") {
                refreshGit(props.workspaceId)
            }
        })

        // 2. Listen for external window focus (e.g. returning from VS Code/Terminal)
        const handleFocus = () => refreshGit(props.workspaceId)
        window.addEventListener("focus", handleFocus)

        onCleanup(() => {
            cleanupServerEvents()
            window.removeEventListener("focus", handleFocus)
        })
    })

    createEffect(() => {
        // Refresh when workspace changes
        const id = props.workspaceId
        if (id) {
            refreshGit(id)
        }
    })

    // Auto-resize commit message textarea based on content
    createEffect(() => {
        commitMessage() // Track changes
        resizeTextarea()
    })

    const handleRefresh = () => {
        refreshGit(props.workspaceId)
    }

    // Helper to resize textarea
    const resizeTextarea = () => {
        const textarea = commitTextareaRef
        if (textarea) {
            // Reset height to auto to correctly calculate scrollHeight
            textarea.style.height = "auto"
            textarea.style.overflowY = "hidden" // Prevent scrollbar flicker affecting width

            // Calculate new height based on content
            const scrollHeight = textarea.scrollHeight
            const minHeight = 40
            const maxHeight = 160
            const borderAdjust = 2 // Account for border (1px top + 1px bottom)

            // Clamp between min and max
            const newHeight = Math.min(Math.max(scrollHeight + borderAdjust, minHeight), maxHeight)
            textarea.style.height = `${newHeight}px`

            // Show scrollbar only if content exceeds max height
            if (scrollHeight + borderAdjust > maxHeight) {
                textarea.style.overflowY = "auto"
            }
        }
    }

    const handleStage = async (path: string) => {
        await stageFiles(props.workspaceId, [path])
    }

    const handleUnstage = async (path: string) => {
        await unstageFiles(props.workspaceId, [path])
    }

    const handleDiscard = async (path: string) => {
        if (confirm(`Discard changes to ${path}?`)) {
            await discardChanges(props.workspaceId, [path])
        }
    }

    const handleDelete = async (path: string) => {
        if (confirm(`Delete ${path}? This action cannot be undone.`)) {
            await deleteFiles(props.workspaceId, [path])
        }
    }

    const handleStageAll = async () => {
        const paths = git.unstagedChanges().map((c) => c.path)
        if (paths.length > 0) {
            await stageFiles(props.workspaceId, paths)
        }
    }

    const handleStageAllUntracked = async () => {
        const paths = git.untrackedChanges().map((c) => c.path)
        if (paths.length > 0) {
            await stageFiles(props.workspaceId, paths)
        }
    }

    const handleUnstageAll = async () => {
        const paths = git.stagedChanges().map((c) => c.path)
        if (paths.length > 0) {
            await unstageFiles(props.workspaceId, paths)
        }
    }

    const handleCommit = async () => {
        const message = commitMessage().trim()
        if (!message) return
        const success = await commitChanges(props.workspaceId, message)
        if (success) {
            setCommitMessage("")
        }
    }

    const handlePush = async () => {
        const currentBranch = git.branches().find((b) => b.current)
        const hasUpstream = !!currentBranch?.upstream
        // If no upstream, we are publishing
        await pushChanges(props.workspaceId, !hasUpstream)
    }

    // Helper function to robustly extract text from part data
    const extractTextFromPart = (part: any): string => {
        if (!part || !part.data) return ""

        const data = part.data
        if (data.type !== "text") return ""

        const text = data.text

        // Handle simple string
        if (typeof text === "string") return text

        // Handle object structure with text, value, or nested content
        if (text && typeof text === "object") {
            const parts: string[] = []

            if (typeof text.value === "string") parts.push(text.value)
            if (typeof text.text === "string") parts.push(text.text)

            if (Array.isArray(text.content)) {
                const nestedTexts = text.content
                    .map((item: unknown) => extractTextFromPart({ data: { type: "text", text: item } }))
                    .filter((t: string) => t && t.trim().length > 0)
                parts.push(nestedTexts.join("\n"))
            }

            return parts.filter((p) => p && p.trim().length > 0).join("\n")
        }

        return ""
    }

    // Helper function to clean commit message by removing markdown formatting
    const cleanCommitMessage = (text: string): string => {
        let cleaned = text.trim()

        // Remove code blocks (```...```)
        cleaned = cleaned.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "")

        // Remove inline code backticks if the whole thing is wrapped
        if (cleaned.startsWith("`") && cleaned.endsWith("`")) {
            cleaned = cleaned.slice(1, -1)
        }

        return cleaned.trim()
    }

    // Helper function to check if session is idle (no streaming, no pending parts)
    const isSessionIdle = (store: any, sessionId: string): boolean => {
        const messageIds = store.getSessionMessageIds(sessionId)
        const messages = messageIds
            .map((id: string) => store.getMessage(id))
            .filter((m: any) => m !== undefined)

        // Check for any streaming messages
        const hasStreaming = messages.some((m: { status: string }) => m.status === "streaming")
        if (hasStreaming) return false

        // Check for pending parts
        const pendingParts = store.getPendingParts ? store.getPendingParts(sessionId) : []
        if (pendingParts && pendingParts.length > 0) return false

        return true
    }

    const handleGenerateCommitMessage = async () => {
        if (git.stagedChanges().length === 0) return

        setIsGeneratingCommit(true)
        let tempSessionId: string | null = null

        try {
            // Get staged diff
            const diffResponse = await serverApi.fetchGitDiff(props.workspaceId, undefined, true)
            const diff = diffResponse.diff

            if (!diff || diff.trim().length === 0) {
                console.warn("No staged diff available")
                return
            }

            // Create a temporary session for commit generation
            const session = await createSession(props.workspaceId)
            tempSessionId = session.id

            // Get the default model
            const defaultModel = await getDefaultModel(props.workspaceId)

            // Build the prompt
            const prompt = `Generate a Structured, Semantic and Clear Commit message based on the provided diff.
Follow these structural rules strictly:

1. Format: "<type>(<scope>): <summary>"
2. Summary: Imperative mood ("add" not "added"), lowercase, no period, max 50 chars.
3. Body: If the change is complex, include a blank line followed by a bulleted list:
   - Use bullets (-) for distinct technical changes or side effects.
   - Wrap body text at 72 characters.
   - Focus on "what" and "why" rather than "how".
4. Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.

IMPORTANT: Output ONLY the raw commit message text. Do NOT wrap it in markdown code blocks, do NOT add explanations, do NOT use backticks or any formatting. Just output the plain text commit message directly.

Diff:
${diff}`

            // Get instance and send message
            const instance = instances().get(props.workspaceId)
            if (!instance || !instance.client) {
                throw new Error("Instance not ready")
            }

            // Send the prompt
            const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
            await instance.client.session.promptAsync({
                sessionID: tempSessionId,
                messageID: messageId,
                parts: [{ id: `part_${Date.now()}`, type: "text", text: prompt }],
                model: {
                    providerID: defaultModel.providerId,
                    modelID: defaultModel.modelId,
                },
            })

            // Wait for assistant response with timeout
            const commitMessage = await new Promise<string>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error("Timeout waiting for commit message generation"))
                }, 30000)

                let idleDetectedTime: number | null = null
                const IDLE_STABILIZATION_DELAY = 800 // Wait 800ms after idle detection before extraction

                const checkForResponse = () => {
                    const store = messageStoreBus.getOrCreate(props.workspaceId)

                    // Wait for session to be idle before extracting
                    if (!isSessionIdle(store, tempSessionId!)) {
                        idleDetectedTime = null // Reset if not idle
                        setTimeout(checkForResponse, 500)
                        return
                    }

                    // First time detecting idle state
                    if (idleDetectedTime === null) {
                        idleDetectedTime = Date.now()
                        setTimeout(checkForResponse, 500)
                        return
                    }

                    // Wait for stabilization period after idle detected
                    const timeSinceIdle = Date.now() - idleDetectedTime
                    if (timeSinceIdle < IDLE_STABILIZATION_DELAY) {
                        setTimeout(checkForResponse, 500)
                        return
                    }

                    const messageIds = store.getSessionMessageIds(tempSessionId!)
                    const messages = messageIds
                        .map((id: string) => store.getMessage(id))
                        .filter((m): m is NonNullable<typeof m> => m !== undefined)

                    // Look for complete assistant message after our user message
                    const assistantMessage = messages.find(
                        (m: { role: string; status: string; createdAt: number }) =>
                            m.role === "assistant" &&
                            m.status === "complete" &&
                            m.createdAt > Date.now() - 60000
                    )

                    if (assistantMessage && assistantMessage.partIds.length > 0) {
                        // Collect ALL text parts using robust extraction
                        const textParts: string[] = []
                        for (const partId of assistantMessage.partIds) {
                            const partRecord = assistantMessage.parts[partId]
                            const extractedText = extractTextFromPart(partRecord)
                            if (extractedText && extractedText.trim().length > 0) {
                                textParts.push(extractedText)
                            }
                        }

                        // If we found any text parts, combine them
                        if (textParts.length > 0) {
                            const fullText = cleanCommitMessage(textParts.join("\n").trim())

                            // Validate that the message looks complete
                            // A complete message should have at least "type(scope): " format
                            // Minimum reasonable length is around 15 characters
                            const looksIncomplete = 
                                fullText.length < 10 || 
                                (fullText.includes("(") && !fullText.includes(")")) ||
                                (fullText.includes("(") && !fullText.includes(":"))

                            if (looksIncomplete) {
                                console.warn("Extracted message looks incomplete, retrying:", fullText)
                                // Reset idle detection and retry
                                idleDetectedTime = null
                                setTimeout(checkForResponse, 500)
                                return
                            }

                            clearTimeout(timeout)
                            resolve(fullText)
                            return
                        }
                    }

                    // Check again in 500ms
                    setTimeout(checkForResponse, 500)
                }

                checkForResponse()
            })

            // Set the generated commit message
            setCommitMessage(commitMessage)

            // Add delay to ensure message extraction is complete before cleanup
            // Increased to 800ms to prevent race condition with message store finalization
            await new Promise(resolve => setTimeout(resolve, 800))
        } catch (error) {
            console.error("Failed to generate commit message:", error)
        } finally {
            // Clean up temporary session
            if (tempSessionId) {
                try {
                    await deleteSession(props.workspaceId, tempSessionId)
                } catch (cleanupError) {
                    console.warn("Failed to cleanup temporary session:", cleanupError)
                }
            }
            setIsGeneratingCommit(false)
        }
    }

    const handleViewDiff = async (file: GitFileChange) => {
        try {
            // For untracked files, show full content instead of diff
            if (file.status === "untracked") {
                const response = await serverApi.fetchGitFileContent(props.workspaceId, file.path)
                setDiffPath(file.path)
                setDiffContent(response.content)
                setIsFileContent(true)
                setShowDiff(true)
            } else {
                const response = await serverApi.fetchGitDiff(props.workspaceId, file.path, file.staged)
                setDiffPath(file.path)
                setDiffContent(response.diff)
                setIsFileContent(false)
                setShowDiff(true)
            }
        } catch (error) {
            console.error("Failed to fetch diff", error)
        }
    }

    const renderDiffLine = (line: string, _index: number) => {
        // Skip file metadata lines (diff --git, index, ---, +++)
        if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
            return null
        }

        // Skip hunk headers (@@ line numbers) - too confusing
        if (line.startsWith("@@")) {
            return null
        }

        // Determine line type and styling
        let bgClass = ""
        let textClass = "text-primary"
        let borderClass = ""
        let prefix = line.substring(0, 1)
        let content = line.substring(1)

        if (line.startsWith("+")) {
            // Added line
            bgClass = "bg-green-500/10"
            borderClass = "border-l-2 border-green-500"
            textClass = "text-green-400"
        } else if (line.startsWith("-")) {
            // Removed line
            bgClass = "bg-red-500/10"
            borderClass = "border-l-2 border-red-500"
            textClass = "text-red-400"
        } else {
            // Context line
            textClass = "text-secondary"
            prefix = " "
            content = line
        }

        return (
            <div class={`px-2 py-0.5 ${bgClass} ${borderClass} hover:bg-surface-tertiary/50`}>
                <span class={`${textClass} font-mono text-xs whitespace-pre`}>
                    <span class="select-none inline-block w-4 text-gray-500">{prefix}</span>
                    <span class="whitespace-pre-wrap break-all">{content}</span>
                </span>
            </div>
        )
    }

    const renderFileContentLine = (line: string, index: number) => {
        return (
            <div class="px-2 py-0.5 hover:bg-surface-tertiary/50">
                <span class="text-primary font-mono text-xs whitespace-pre">
                    <span class="select-none inline-block w-12 text-gray-500 text-right mr-2">{index + 1}</span>
                    <span class="whitespace-pre-wrap break-all">{line}</span>
                </span>
            </div>
        )
    }

    const handleBranchSelect = async (branch: string) => {
        setShowBranchPicker(false)
        await checkoutBranch(props.workspaceId, branch)
    }

    const getStatusIcon = (status: GitFileChange["status"]) => {
        switch (status) {
            case "added":
                return "A"
            case "modified":
                return "M"
            case "deleted":
                return "D"
            case "renamed":
                return "R"
            case "untracked":
                return "U"
            default:
                return "?"
        }
    }

    const getStatusColor = (status: GitFileChange["status"]) => {
        switch (status) {
            case "added":
                return "text-green-500"
            case "modified":
                return "text-yellow-500"
            case "deleted":
                return "text-red-500"
            case "renamed":
                return "text-blue-500"
            case "untracked":
                return "text-gray-400"
            default:
                return "text-secondary"
        }
    }

    const hasFolderContents = (folderPath: string): boolean => {
        const untracked = git.untrackedChanges()
        const folderPrefix = folderPath.endsWith("/") ? folderPath : `${folderPath}/`

        return untracked.some((file) => {
            const filePath = file.path
            // Check if file path starts with folder prefix (is inside the folder)
            // But is not the folder entry itself
            return filePath.startsWith(folderPrefix) && filePath !== folderPath
        })
    }

    const FileChangeItem: Component<{
        file: GitFileChange
        showStage?: boolean
        showUnstage?: boolean
        showDiscard?: boolean
        showDelete?: boolean
    }> = (itemProps) => (
        <div class="group flex items-center gap-2 px-2 py-1 hover:bg-surface-tertiary rounded text-xs">
            <span
                class={`font-mono w-4 text-center ${getStatusColor(itemProps.file.status)}`}
                title={itemProps.file.status}
            >
                {getStatusIcon(itemProps.file.status)}
            </span>
            <button
                type="button"
                class="flex-1 text-left truncate text-primary hover:underline"
                onClick={() => handleViewDiff(itemProps.file)}
                title={`View diff: ${itemProps.file.path}`}
            >
                {(() => {
                    const path = itemProps.file.path
                    // Handle directories (trailing slash) - show dir name with indicator
                    if (path.endsWith("/")) {
                        const parts = path.slice(0, -1).split("/")
                        const folderName = parts[parts.length - 1] + "/"
                        const hasContents = hasFolderContents(path)
                        return hasContents ? `${folderName}*` : folderName
                    }
                    // Normal file - show filename
                    return path.split("/").pop() || path
                })()}
            </button>
            <div class="flex items-center gap-1">
                <Show when={itemProps.showStage}>
                    <button
                        type="button"
                        class="p-1 hover:bg-surface-secondary rounded"
                        onClick={() => handleStage(itemProps.file.path)}
                        title="Stage this file for commit"
                    >
                        <Plus class="h-3 w-3" />
                    </button>
                </Show>
                <Show when={itemProps.showUnstage}>
                    <button
                        type="button"
                        class="p-1 hover:bg-surface-secondary rounded"
                        onClick={() => handleUnstage(itemProps.file.path)}
                        title="Remove from staging"
                    >
                        <Minus class="h-3 w-3" />
                    </button>
                </Show>
                <Show when={itemProps.showDiscard}>
                    <button
                        type="button"
                        class="p-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded text-red-500"
                        onClick={() => handleDiscard(itemProps.file.path)}
                        title="Discard changes (danger)"
                    >
                        <Undo2 class="h-3 w-3" />
                    </button>
                </Show>
                <Show when={itemProps.showDelete}>
                    <button
                        type="button"
                        class="p-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded text-red-500"
                        onClick={() => handleDelete(itemProps.file.path)}
                        title="Delete (danger)"
                    >
                        <X class="h-3 w-3" />
                    </button>
                </Show>
            </div>
        </div>
    )

    return (
        <div class="flex flex-col gap-2">
            <Show when={!git.isGitRepo()}>
                <p class="text-xs text-secondary">Not a git repository.</p>
            </Show>

            <Show when={git.isGitRepo()}>
                {/* Branch selector */}
                <div class="flex items-center gap-2">
                    <div class="relative flex-1 min-w-0">
                        <button
                            type="button"
                            class="w-full flex items-center gap-2 px-2 py-1 text-xs bg-surface-tertiary rounded hover:bg-surface-secondary"
                            onClick={() => {
                                fetchGitBranches(props.workspaceId)
                                setShowBranchPicker(!showBranchPicker())
                            }}
                            title="Switch branch"
                        >
                            <GitBranch class="h-3 w-3 shrink-0" />
                            <span class="flex-1 text-left truncate min-w-0">{git.currentBranch() || "No branch"}</span>
                            <ChevronDown class="h-3 w-3 shrink-0" />
                        </button>
                        <Show when={showBranchPicker()}>
                            <div class="absolute top-full left-0 right-0 mt-1 bg-surface-secondary border border-base rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                                <For each={git.branches().filter((b) => !b.remote)}>
                                    {(branch) => (
                                        <button
                                            type="button"
                                            class={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-tertiary ${branch.current ? "bg-surface-tertiary font-semibold" : ""
                                                }`}
                                            onClick={() => handleBranchSelect(branch.name)}
                                            title={branch.name}
                                        >
                                            {branch.name}
                                            <Show when={branch.current}>
                                                <Check class="inline h-3 w-3 ml-1" />
                                            </Show>
                                        </button>
                                    )}
                                </For>
                            </div>
                        </Show>
                    </div>
                    <button
                        type="button"
                        class="p-1 hover:bg-surface-secondary rounded"
                        onClick={handleRefresh}
                        disabled={git.loading()}
                        title="Refresh"
                    >
                        <RefreshCw class={`h-4 w-4 ${git.loading() ? "animate-spin" : ""}`} />
                    </button>
                </div>

                {/* Commit input */}
                <div class="flex flex-col gap-1">
                    <div class="relative">
                        <textarea
                            ref={commitTextareaRef}
                            class="w-full px-2 py-1 text-xs bg-surface-tertiary border border-base rounded resize-none pr-8"
                            style={{ "overflow-y": "hidden", "line-height": "1.5" }}
                            rows={1}
                            placeholder="Commit message..."
                            value={commitMessage()}
                            onInput={(e) => {
                                setCommitMessage(e.currentTarget.value)
                                resizeTextarea()
                            }}
                        />
                        <button
                            type="button"
                            class="absolute right-1 top-1 p-1 hover:bg-surface-secondary rounded text-secondary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleGenerateCommitMessage}
                            disabled={git.stagedChanges().length === 0 || isGeneratingCommit() || git.loading()}
                            title="Generate commit message with AI"
                        >
                            <Show when={!isGeneratingCommit()} fallback={<RefreshCw class="h-3 w-3 animate-spin" />}>
                                <Sparkles class="h-3 w-3" />
                            </Show>
                        </button>
                    </div>
                    <div class="flex items-center gap-1">
                        <button
                            type="button"
                            class="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                            disabled={!commitMessage().trim() || git.stagedChanges().length === 0 || git.loading()}
                            onClick={handleCommit}
                            title="Commit"
                        >
                            Commit ({git.stagedChanges().length} staged)
                        </button>
                        <button
                            type="button"
                            class="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                            disabled={git.loading() || (git.status()?.ahead ?? 0) <= 0}
                            onClick={handlePush}
                            title={(() => {
                                const currentBranch = git.branches().find((b) => b.current)
                                const hasUpstream = !!currentBranch?.upstream
                                return hasUpstream ? "Push to remote" : "Publish Branch"
                            })()}
                        >
                            <UploadCloud class="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <Show when={git.error()}>
                    <p class="text-xs text-red-500">{git.error()}</p>
                </Show>

                {/* File sections */}
                <div class="flex flex-col gap-1">
                    {/* Staged Changes */}
                    <div class="border border-base rounded">
                        <button
                            type="button"
                            class="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold hover:bg-surface-tertiary"
                            onClick={() => {
                                const current = expandedSections()
                                setExpandedSections(
                                    current.includes("staged") ? current.filter((s) => s !== "staged") : [...current, "staged"],
                                )
                            }}
                            title="Toggle staged changes section"
                        >
                            <span>Staged ({git.stagedChanges().length})</span>
                            <div class="flex items-center gap-1">
                                <Show when={git.stagedChanges().length > 0}>
                                    <button
                                        type="button"
                                        class="p-0.5 hover:bg-surface-secondary rounded"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleUnstageAll()
                                        }}
                                        title="Unstage All"
                                    >
                                        <Minus class="h-3 w-3" />
                                    </button>
                                </Show>
                                <ChevronDown
                                    class={`h-3 w-3 transition-transform ${expandedSections().includes("staged") ? "rotate-180" : ""}`}
                                />
                            </div>
                        </button>
                        <Show when={expandedSections().includes("staged")}>
                            <div class="px-1 pb-1">
                                <Show when={git.stagedChanges().length === 0}>
                                    <p class="text-xs text-secondary px-2 py-1">No staged changes</p>
                                </Show>
                                <For each={git.stagedChanges()}>{(file) => <FileChangeItem file={file} showUnstage />}</For>
                            </div>
                        </Show>
                    </div>

                    {/* Changes */}
                    <div class="border border-base rounded">
                        <button
                            type="button"
                            class="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold hover:bg-surface-tertiary"
                            onClick={() => {
                                const current = expandedSections()
                                setExpandedSections(
                                    current.includes("changes") ? current.filter((s) => s !== "changes") : [...current, "changes"],
                                )
                            }}
                            title="Toggle unstaged changes section"
                        >
                            <span>Changes ({git.unstagedChanges().length})</span>
                            <div class="flex items-center gap-1">
                                <Show when={git.unstagedChanges().length > 0}>
                                    <button
                                        type="button"
                                        class="p-0.5 hover:bg-surface-secondary rounded"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleStageAll()
                                        }}
                                        title="Stage All"
                                    >
                                        <Plus class="h-3 w-3" />
                                    </button>
                                </Show>
                                <ChevronDown
                                    class={`h-3 w-3 transition-transform ${expandedSections().includes("changes") ? "rotate-180" : ""}`}
                                />
                            </div>
                        </button>
                        <Show when={expandedSections().includes("changes")}>
                            <div class="px-1 pb-1">
                                <Show when={git.unstagedChanges().length === 0}>
                                    <p class="text-xs text-secondary px-2 py-1">No changes</p>
                                </Show>
                                <For each={git.unstagedChanges()}>
                                    {(file) => <FileChangeItem file={file} showStage showDiscard />}
                                </For>
                            </div>
                        </Show>
                    </div>

                    {/* Untracked */}
                    <div class="border border-base rounded">
                        <button
                            type="button"
                            class="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold hover:bg-surface-tertiary"
                            onClick={() => {
                                const current = expandedSections()
                                setExpandedSections(
                                    current.includes("untracked") ? current.filter((s) => s !== "untracked") : [...current, "untracked"],
                                )
                            }}
                            title="Toggle untracked files section"
                        >
                            <span>Untracked ({git.untrackedChanges().length})</span>
                            <div class="flex items-center gap-1">
                                <Show when={git.untrackedChanges().length > 0}>
                                    <button
                                        type="button"
                                        class="p-0.5 hover:bg-surface-secondary rounded"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleStageAllUntracked()
                                        }}
                                        title="Stage All Untracked"
                                    >
                                        <Plus class="h-3 w-3" />
                                    </button>
                                </Show>
                                <ChevronDown
                                    class={`h-3 w-3 transition-transform ${expandedSections().includes("untracked") ? "rotate-180" : ""}`}
                                />
                            </div>
                        </button>
                        <Show when={expandedSections().includes("untracked")}>
                            <div class="px-1 pb-1">
                                <Show when={git.untrackedChanges().length === 0}>
                                    <p class="text-xs text-secondary px-2 py-1">No untracked files</p>
                                </Show>
                                <For each={git.untrackedChanges()}>{(file) => <FileChangeItem file={file} showStage showDelete />}</For>
                            </div>
                        </Show>
                    </div>
                </div>
            </Show>

            {/* Diff Modal */}
            <Show when={showDiff()}>
                <div
                    class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowDiff(false)}
                >
                    <div
                        class="bg-surface-base border border-base rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div class="flex items-center justify-between px-4 py-2 border-b border-base">
                            <span class="font-semibold text-sm">
                                {diffPath()} {isFileContent() && <span class="text-secondary text-xs ml-2">(Preview)</span>}
                            </span>
                            <button type="button" class="p-1 hover:bg-surface-secondary rounded" onClick={() => setShowDiff(false)} title="Close">
                                ×
                            </button>
                        </div>
                        <div class="flex-1 overflow-auto bg-surface-secondary">
                            <Show when={diffContent()} fallback={<p class="text-secondary text-sm p-4">No changes</p>}>
                                <div class="font-mono text-xs leading-relaxed">
                                    <Show when={isFileContent()} fallback={
                                        <For each={diffContent().split("\n")}>
                                            {(line, index) => renderDiffLine(line, index())}
                                        </For>
                                    }>
                                        <For each={diffContent().split("\n")}>
                                            {(line, index) => renderFileContentLine(line, index())}
                                        </For>
                                    </Show>
                                </div>
                            </Show>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    )
}

export default SourceControlPanel
