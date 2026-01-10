import { createMemo, For, onMount, onCleanup, Show, type Component } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { QuestionInfo, QuestionAnswer } from "../types/question"

export interface AskQuestionWizardProps {
    questions: QuestionInfo[]
    onSubmit: (answers: QuestionAnswer[]) => void
    onCancel: () => void
}

interface QuestionState {
    selectedOption: number
    selectedValues: string[]
    customText?: string
}

export const AskQuestionWizard: Component<AskQuestionWizardProps> = (props) => {
    console.log('[AskQuestionWizard] Component mounted/updated with props:', {
        questionsCount: props.questions?.length,
        questions: props.questions
    })

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

    // Current question based on active tab
    const currentQuestion = createMemo(() => {
        const question = props.questions[store.activeTab]
        console.log('[AskQuestionWizard] currentQuestion memo', {
            activeTab: store.activeTab,
            question: question,
            id: question?.id,
            multiSelect: question?.multiSelect,
            options: question?.options
        })
        return question
    })
    const currentState = createMemo(() => store.questionStates[store.activeTab])

    // Options including "Type something..." at the end
    const optionsWithCustom = createMemo(() => {
        const current = currentQuestion()
        if (!current) return []
        return [
            ...current.options,
            { value: "__custom__", label: "Type something...", description: "Enter your own response" },
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
        if (!allAnswered()) return
        const answers: QuestionAnswer[] = props.questions.map((q, i) => {
            const state = store.questionStates[i]
            return {
                questionId: q.id,
                values: state.selectedValues,
                customText: state.customText,
            }
        })
        props.onSubmit(answers)
    }

    function selectOption(optionValue: string) {
        const question = currentQuestion()
        console.log('[AskQuestionWizard] selectOption called', {
            optionValue,
            multiSelect: question.multiSelect,
            currentSelectedValues: currentState().selectedValues
        })

        setStore(
            produce((s) => {
                const state = s.questionStates[s.activeTab]
                state.customText = undefined

                if (question.multiSelect) {
                    // Toggle for multi-select
                    const idx = state.selectedValues.indexOf(optionValue)
                    console.log('[AskQuestionWizard] Multi-select toggle', {
                        optionValue,
                        currentIndex: idx,
                        currentArray: [...state.selectedValues]
                    })

                    if (idx >= 0) {
                        // Remove  if already selected
                        state.selectedValues.splice(idx, 1)
                        console.log('[AskQuestionWizard] Removed from selection', {
                            newArray: [...state.selectedValues]
                        })
                    } else {
                        // Add if not selected
                        state.selectedValues.push(optionValue)
                        console.log('[AskQuestionWizard] Added to selection', {
                            newArray: [...state.selectedValues]
                        })
                    }
                } else {
                    // Select for single-select and auto-advance
                    state.selectedValues = [optionValue]
                    if (s.activeTab < props.questions.length - 1) {
                        s.activeTab++
                    }
                }
            }),
        )
        // Auto-submit if single-select on last question and all answered
        if (!question.multiSelect) {
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
        setStore(
            produce((s) => {
                if (direction === "up") {
                    s.questionStates[s.activeTab].selectedOption = current > 0 ? current - 1 : max
                } else {
                    s.questionStates[s.activeTab].selectedOption = current < max ? current + 1 : 0
                }
            }),
        )
    }

    function navigateQuestion(direction: "left" | "right") {
        if (direction === "right") {
            if (store.activeTab < props.questions.length - 1) {
                setStore("activeTab", store.activeTab + 1)
            } else if (allAnswered()) {
                handleSubmit()
            }
        } else {
            if (store.activeTab > 0) {
                setStore("activeTab", store.activeTab - 1)
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

            const optionValue = option.value
            if (optionValue === "__custom__") {
                openCustomInput()
                return
            }

            selectOption(optionValue)
            return
        }

        // Enter to select option (single-select) or confirm and advance (multi-select)
        if (evt.key === "Enter" && !evt.ctrlKey && !evt.metaKey) {
            evt.preventDefault()
            evt.stopPropagation()
            const selectedIdx = currentState().selectedOption
            const option = optionsWithCustom()[selectedIdx]
            if (!option) return

            const optionValue = option.value
            if (optionValue === "__custom__") {
                openCustomInput()
                return
            }

            const question = currentQuestion()
            if (question.multiSelect) {
                // For multi-select: Enter confirms current selections and advances
                if (currentAnswered()) {
                    navigateQuestion("right")
                    return
                }
                // If nothing selected yet, toggle the current option
                selectOption(optionValue)
                return
            }

            // Single-select: select and advance
            selectOption(optionValue)
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
                    selectOption(option.value)
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
                    onClick={props.onCancel}
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
                                <span class="askquestion-wizard-tab-label">{question.label}</span>
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
                <h3 class="askquestion-wizard-question-text">{currentQuestion().question}</h3>
                <Show when={currentQuestion().multiSelect}>
                    <p class="askquestion-wizard-question-hint">(select multiple, press Enter to confirm)</p>
                </Show>
            </div>

            {/* Options */}
            <div class="askquestion-wizard-options">
                <For each={optionsWithCustom()}>
                    {(option, index) => {
                        // Capture the option value outside reactive scope to prevent undefined
                        const optionValue = option.value
                        const optionLabel = option.label
                        const optionDescription = option.description

                        const isSelected = createMemo(() => currentState().selectedOption === index())
                        const isChosen = createMemo(() => {
                            if (optionValue === "__custom__") {
                                return !!currentState().customText
                            }
                            return currentState().selectedValues.includes(optionValue)
                        })
                        const isCustomOption = optionValue === "__custom__"

                        return (
                            <button
                                type="button"
                                class="askquestion-wizard-option"
                                classList={{
                                    "askquestion-wizard-option-selected": isSelected(),
                                    "askquestion-wizard-option-chosen": isChosen(),
                                }}
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
                                        // Use captured optionValue to avoid undefined
                                        selectOption(optionValue)
                                    }
                                }}

                            >
                                {/* Selection indicator */}
                                <span class="askquestion-wizard-option-indicator">
                                    {isCustomOption
                                        ? "›"
                                        : currentQuestion().multiSelect
                                            ? isChosen()
                                                ? "[✓]"
                                                : "[ ]"
                                            : isChosen()
                                                ? "●"
                                                : "○"}
                                </span>
                                {/* Option label */}
                                <div class="askquestion-wizard-option-content">
                                    <span class="askquestion-wizard-option-label">{optionLabel}</span>
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
                    {currentQuestion().multiSelect
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
