import { createMemo, For, onMount, onCleanup, Show, type Component, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createEffect } from "solid-js"
import type { WizardQuestion, QuestionAnswer, QuestionOption } from "../types/question"
import { renderMarkdown } from "../lib/markdown"

// Custom option marker
const CUSTOM_OPTION_LABEL = "Type something..."

// Extended option type that includes the custom option
type WizardOption = QuestionOption & { isCustom?: boolean }

export interface AskQuestionWizardProps {
    questions: WizardQuestion[]
    onSubmit: (answers: QuestionAnswer[]) => void
    onCancel: () => void
}

interface QuestionState {
    selectedOption: number
    selectedValues: string[]
    customText?: string
}

export const AskQuestionWizard: Component<AskQuestionWizardProps> = (props) => {
    // State for the wizard
    const [store, setStore] = createStore({
        activeTab: 0,
        questionStates: props.questions.map(() => ({
            selectedOption: 0,
            selectedValues: [] as string[],
            customText: undefined as string | undefined,
        })) as QuestionState[],
        isTypingCustom: false,
        customInputValue: "",
    })

    let containerRef: HTMLDivElement | undefined
    let inputRef: HTMLInputElement | undefined
    let optionsContainerRef: HTMLDivElement | undefined
    let optionRefs: HTMLButtonElement[] = []

    // Current question based on active tab
    const currentQuestion = createMemo(() => {
        const question = props.questions[store.activeTab]
        return question
    })
    const currentState = createMemo(() => store.questionStates[store.activeTab])

    // Rendered markdown for the question text
    const [questionHtml, setQuestionHtml] = createSignal("")

    // Render question text as markdown
    createEffect(async () => {
        const question = currentQuestion()
        if (question && question.question) {
            try {
                const html = await renderMarkdown(question.question)
                setQuestionHtml(html)
            } catch (error) {
                console.error("[AskQuestionWizard] Failed to render question markdown:", error)
                setQuestionHtml(question.question) // Fallback to plain text
            }
        } else {
            setQuestionHtml("")
        }
    })

    // Options including "Type something..." at the end
    const optionsWithCustom = createMemo((): WizardOption[] => {
        const current = currentQuestion()
        if (!current) return []
        return [
            ...current.options,
            { label: CUSTOM_OPTION_LABEL, description: "Enter your own response", isCustom: true },
        ]
    })

    // Check if all questions have at least one answer
    const allAnswered = createMemo(() =>
        store.questionStates.every((state) => state.selectedValues.length > 0 || state.customText),
    )

    // Check if current question is answered
    const currentAnswered = createMemo(() => {
        const state = currentState()
        return state.selectedValues.length > 0 || state.customText
    })

    function handleSubmit() {
        if (!allAnswered()) {
            return
        }
        // Unwrap proxy values to plain arrays/objects before passing to parent
        const answers: QuestionAnswer[] = props.questions.map((q, i) => {
            const state = store.questionStates[i]
            return {
                questionId: q.id || `q-${i}`,
                // Convert proxy array to plain array
                values: [...state.selectedValues],
                customText: state.customText,
            }
        })
        props.onSubmit(answers)
    }

    function selectOption(optionLabel: string) {
        const question = currentQuestion()

        setStore(
            produce((s) => {
                const state = s.questionStates[s.activeTab]
                state.customText = undefined

                if (question.multiple) {
                    // Toggle for multi-select (use label as value)
                    const idx = state.selectedValues.indexOf(optionLabel)
                    console.log('[AskQuestionWizard] Multi-select toggle', {
                        optionLabel,
                        currentIndex: idx,
                        currentArray: [...state.selectedValues]
                    })

                    if (idx >= 0) {
                        // Remove if already selected
                        state.selectedValues.splice(idx, 1)
                        console.log('[AskQuestionWizard] Removed from selection', {
                            newArray: [...state.selectedValues]
                        })
                    } else {
                        // Add if not selected
                        state.selectedValues.push(optionLabel)
                        console.log('[AskQuestionWizard] Added to selection', {
                            newArray: [...state.selectedValues]
                        })
                    }
                } else {
                    // Select for single-select and auto-advance
                    state.selectedValues = [optionLabel]
                    if (s.activeTab < props.questions.length - 1) {
                        s.activeTab++
                    }
                }
            }),
        )
        // Auto-submit if single-select on last question and all answered
        if (!question.multiple) {
            setTimeout(() => {
                if (allAnswered()) {
                    handleSubmit()
                }
            }, 50)
        }
    }

    function navigateOption(direction: "up" | "down") {
        const current = currentState().selectedOption
        const max = optionsWithCustom().length - 1
        const newOptionIdx = direction === "up"
            ? (current > 0 ? current - 1 : max)
            : (current < max ? current + 1 : 0)

        setStore(
            produce((s) => {
                s.questionStates[s.activeTab].selectedOption = newOptionIdx
            }),
        )

        // Scroll the newly selected option into view
        setTimeout(() => {
            const selectedElement = optionsContainerRef?.querySelector('[data-option-selected="true"]')
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                })
            }
        }, 0)
    }

    function navigateQuestion(direction: "left" | "right") {
        if (direction === "right") {
            if (store.activeTab < props.questions.length - 1) {
                setStore("activeTab", store.activeTab + 1)
                // Reset option refs when switching questions
                optionRefs = []
            } else if (allAnswered()) {
                handleSubmit()
            }
        } else {
            if (store.activeTab > 0) {
                setStore("activeTab", store.activeTab - 1)
                // Reset option refs when switching questions
                optionRefs = []
            }
        }
    }

    function openCustomInput() {
        setStore("isTypingCustom", true)
        setTimeout(() => inputRef?.focus(), 10)
    }

    function submitCustomInput() {
        const value = store.customInputValue.trim()
        if (value) {
            setStore(
                produce((s) => {
                    s.questionStates[s.activeTab].customText = value
                    s.questionStates[s.activeTab].selectedValues = []
                }),
            )
        }
        setStore("isTypingCustom", false)
        setStore("customInputValue", "")
        // Auto-advance to next question or submit
        if (store.activeTab < props.questions.length - 1) {
            setStore("activeTab", store.activeTab + 1)
        } else if (allAnswered()) {
            handleSubmit()
        }
    }

    function handleKeyDown(evt: KeyboardEvent) {
        // Allow the event to be handled when inside our component
        if (store.isTypingCustom) {
            // In custom input mode
            if (evt.key === "Escape") {
                evt.preventDefault()
                evt.stopPropagation()
                setStore("isTypingCustom", false)
                setStore("customInputValue", "")
                return
            }
            if (evt.key === "Enter" && !evt.shiftKey) {
                evt.preventDefault()
                evt.stopPropagation()
                submitCustomInput()
                return
            }
            // Let other keys through for typing
            return
        }

        // Tab/arrow navigation between questions
        if (evt.key === "Tab" && !evt.shiftKey) {
            evt.preventDefault()
            evt.stopPropagation()
            navigateQuestion("right")
            return
        }
        if (evt.key === "Tab" && evt.shiftKey) {
            evt.preventDefault()
            evt.stopPropagation()
            navigateQuestion("left")
            return
        }
        if (evt.key === "ArrowRight") {
            evt.preventDefault()
            evt.stopPropagation()
            navigateQuestion("right")
            return
        }
        if (evt.key === "ArrowLeft") {
            evt.preventDefault()
            evt.stopPropagation()
            navigateQuestion("left")
            return
        }

        // Up/down navigation within options
        if (evt.key === "ArrowUp" || (evt.ctrlKey && evt.key === "p")) {
            evt.preventDefault()
            evt.stopPropagation()
            navigateOption("up")
            return
        }
        if (evt.key === "ArrowDown" || (evt.ctrlKey && evt.key === "n")) {
            evt.preventDefault()
            evt.stopPropagation()
            navigateOption("down")
            return
        }

        // Space to toggle selection (especially useful for multi-select)
        if (evt.key === " ") {
            evt.preventDefault()
            evt.stopPropagation()
            const selectedIdx = currentState().selectedOption
            const option = optionsWithCustom()[selectedIdx]
            if (!option) return

            if (option.isCustom) {
                openCustomInput()
                return
            }

            selectOption(option.label)
            return
        }

        // Enter to select option (single-select) or confirm and advance (multi-select)
        if (evt.key === "Enter" && !evt.ctrlKey && !evt.metaKey) {
            evt.preventDefault()
            evt.stopPropagation()
            const selectedIdx = currentState().selectedOption
            const option = optionsWithCustom()[selectedIdx]
            if (!option) return

            if (option.isCustom) {
                openCustomInput()
                return
            }

            const question = currentQuestion()
            if (question.multiple) {
                // For multi-select: Enter confirms current selections and advances
                if (currentAnswered()) {
                    navigateQuestion("right")
                    return
                }
                // If nothing selected yet, toggle the current option
                selectOption(option.label)
                return
            }

            // Single-select: select and advance
            selectOption(option.label)
            return
        }

        // Number keys for quick selection (1-8)
        if (evt.key >= "1" && evt.key <= "8" && !evt.ctrlKey && !evt.metaKey) {
            evt.preventDefault()
            evt.stopPropagation()
            const idx = parseInt(evt.key) - 1
            if (idx < currentQuestion().options.length) {
                const option = currentQuestion().options[idx]
                if (option) {
                    selectOption(option.label)
                }
            }
            return
        }

        // Escape to cancel
        if (evt.key === "Escape") {
            evt.preventDefault()
            evt.stopPropagation()
            props.onCancel()
            return
        }

        // Ctrl+Enter to submit
        if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") {
            evt.preventDefault()
            evt.stopPropagation()
            if (allAnswered()) {
                handleSubmit()
            }
            return
        }
    }

    onMount(() => {
        // Focus container to capture keyboard events
        containerRef?.focus()
        document.addEventListener("keydown", handleKeyDown, true)
        // Reset option refs when switching questions
        optionRefs = []
    })

    // Scroll selected option into view when active tab changes
    createEffect(() => {
        const activeTab = store.activeTab
        const selectedOption = store.questionStates[activeTab].selectedOption

        // Scroll to selected option with a slight delay to ensure DOM is updated
        setTimeout(() => {
            const selectedElement = optionsContainerRef?.querySelector('[data-option-selected="true"]')
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                })
            }
        }, 0)
    })

    onCleanup(() => {
        document.removeEventListener("keydown", handleKeyDown, true)
    })

    return (
        <div
            ref={containerRef}
            data-component="askquestion-wizard"
            data-prevent-autofocus
            class="askquestion-wizard"
            tabIndex={0}
        >
            <div class="askquestion-wizard-header">
                <div class="askquestion-wizard-title">Answer the questions</div>
                <button
                    type="button"
                    class="askquestion-wizard-close"
                    onClick={() => {
                        console.log('[AskQuestionWizard] Close button clicked, calling onCancel')
                        console.log('[AskQuestionWizard] props.onCancel type:', typeof props.onCancel)
                        console.log('[AskQuestionWizard] props.onCancel:', props.onCancel)
                        try {
                            props.onCancel()
                            console.log('[AskQuestionWizard] onCancel called successfully')
                        } catch (err) {
                            console.error('[AskQuestionWizard] onCancel threw error:', err)
                        }
                    }}
                    aria-label="Cancel"
                    title="Cancel (Esc)"
                >
                    ✕
                </button>
            </div>

            {/* Tab bar */}
            <div class="askquestion-wizard-tabs">
                <span class="askquestion-wizard-nav-hint">←</span>
                <For each={props.questions}>
                    {(question, index) => {
                        const isActive = createMemo(() => store.activeTab === index())
                        const isAnswered = createMemo(() => {
                            const state = store.questionStates[index()]
                            return state.selectedValues.length > 0 || !!state.customText
                        })
                        return (
                            <button
                                type="button"
                                class="askquestion-wizard-tab"
                                classList={{
                                    "askquestion-wizard-tab-active": isActive(),
                                }}
                                onClick={() => setStore("activeTab", index())}
                            >
                                <span
                                    class="askquestion-wizard-tab-indicator"
                                    classList={{
                                        "askquestion-wizard-tab-indicator-answered": isAnswered(),
                                    }}
                                >
                                    {isAnswered() ? "●" : "○"}
                                </span>
                                <span class="askquestion-wizard-tab-label">{question.header}</span>
                            </button>
                        )
                    }}
                </For>
                <Show when={allAnswered()}>
                    <button
                        type="button"
                        class="askquestion-wizard-submit-tab"
                        onClick={handleSubmit}
                    >
                        <span>✓</span>
                        <span>Submit</span>
                    </button>
                </Show>
                <span class="askquestion-wizard-nav-hint">→</span>
            </div>

            {/* Current question */}
            <div class="askquestion-wizard-question">
                <div class="askquestion-wizard-question-text markdown-body" innerHTML={questionHtml()} />
                <Show when={currentQuestion().multiple}>
                    <p class="askquestion-wizard-question-hint">(select multiple, press Enter to confirm)</p>
                </Show>
            </div>

            {/* Options */}
            <div ref={optionsContainerRef} class="askquestion-wizard-options">
                <For each={optionsWithCustom()}>
                    {(option, index) => {
                        const optionLabel = option.label  // Use label as value
                        const optionLabelText = option.label
                        const optionDescription = option.description
                        const isCustomOption = option.isCustom === true

                        const isSelected = createMemo(() => currentState().selectedOption === index())
                        const isChosen = createMemo(() => {
                            if (isCustomOption) {
                                return !!currentState().customText
                            }
                            return currentState().selectedValues.includes(optionLabel)
                        })

                        return (
                            <button
                                type="button"
                                ref={(el) => { optionRefs[index()] = el }}
                                class="askquestion-wizard-option"
                                classList={{
                                    "askquestion-wizard-option-selected": isSelected(),
                                    "askquestion-wizard-option-chosen": isChosen(),
                                }}
                                data-option-selected={isSelected()}
                                onClick={() => {
                                    // Update selectedOption for visual feedback
                                    setStore(
                                        produce((s) => {
                                            s.questionStates[s.activeTab].selectedOption = index()
                                        }),
                                    )
                                    // Handle click
                                    if (isCustomOption) {
                                        openCustomInput()
                                    } else {
                                        // For multi-select, selectOption toggles the value
                                        // Use label as value (since options don't have value field)
                                        selectOption(optionLabel)
                                    }
                                }}

                            >
                                {/* Selection indicator */}
                                <span class="askquestion-wizard-option-indicator">
                                    {isCustomOption
                                        ? "›"
                                        : currentQuestion().multiple
                                            ? isChosen()
                                                ? "[✓]"
                                                : "[ ]"
                                            : isChosen()
                                                ? "●"
                                                : "○"}
                                </span>
                                {/* Option label */}
                                <div class="askquestion-wizard-option-content">
                                    <span class="askquestion-wizard-option-label">{optionLabelText}</span>
                                    <Show when={optionDescription && !isCustomOption}>
                                        <span class="askquestion-wizard-option-description">{optionDescription}</span>
                                    </Show>
                                </div>
                            </button>
                        )
                    }}
                </For>
            </div>

            {/* Custom input (when active) */}
            <Show when={store.isTypingCustom}>
                <div class="askquestion-wizard-custom-input">
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Type your response..."
                        value={store.customInputValue}
                        onInput={(e) => setStore("customInputValue", e.currentTarget.value)}
                        onKeyDown={(e: KeyboardEvent) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                submitCustomInput()
                            } else if (e.key === "Escape") {
                                e.preventDefault()
                                setStore("isTypingCustom", false)
                                setStore("customInputValue", "")
                            }
                        }}
                        class="askquestion-wizard-custom-input-field"
                    />
                    <div class="askquestion-wizard-custom-actions">
                        <button
                            type="button"
                            class="askquestion-wizard-button askquestion-wizard-button-primary"
                            onClick={submitCustomInput}
                        >
                            Confirm
                        </button>
                        <button
                            type="button"
                            class="askquestion-wizard-button askquestion-wizard-button-ghost"
                            onClick={() => {
                                setStore("isTypingCustom", false)
                                setStore("customInputValue", "")
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Show>

            {/* Instructions - desktop only */}
            <div class="askquestion-wizard-instructions">
                <p>
                    {currentQuestion().multiple
                        ? "Space to toggle · Enter to confirm · ↑↓ to navigate · Esc to cancel"
                        : "Enter/Space to select · ↑↓ to navigate · Esc to cancel"}
                </p>
            </div>

            {/* Action buttons - desktop */}
            <div class="askquestion-wizard-actions">
                <button type="button" class="askquestion-wizard-button askquestion-wizard-button-ghost" onClick={props.onCancel}>
                    Cancel
                </button>
                <Show when={allAnswered()}>
                    <button type="button" class="askquestion-wizard-button askquestion-wizard-button-primary" onClick={handleSubmit}>
                        Submit All
                    </button>
                </Show>
            </div>
        </div>
    )
}
