/**
 * Question types matching OpenCode SDK and shuvcode patterns
 */

export interface QuestionOption {
    /** Short identifier for the option */
    value: string
    /** Display label for the option */
    label: string
    /** Additional context for the option */
    description?: string
}

export interface QuestionInfo {
    /** Unique identifier for the question */
    id: string
    /** Short tab label (e.g., "UI Framework") */
    label: string
    /** The full question text to display */
    question: string
    /** 2-8 suggested answer options */
    options: QuestionOption[]
    /** Allow selecting multiple options */
    multiSelect?: boolean
}

export interface QuestionRequest {
    /** Unique request ID */
    id: string
    /** Session ID this question belongs to */
    sessionID: string
    /** Array of questions to ask */
    questions: QuestionInfo[]
    /** Optional tool metadata */
    tool?: {
        messageID: string
        callID: string
    }
}

export interface QuestionAnswer {
    /** ID of the question being answered */
    questionId: string
    /** Selected option value(s) */
    values: string[]
    /** Custom text if user typed their own response */
    customText?: string
}
