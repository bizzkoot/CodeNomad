// Question types matching OpenCode SDK schema
// Based on shuvcode/packages/opencode/src/question/index.ts

export interface QuestionOption {
    label: string        // Display text (use this as the value too!)
    description: string  // Explanation of choice
}

export interface QuestionInfo {
    id?: string           // Optional in SDK response, generated when mapping to wizard
    question: string      // Complete question text
    header: string        // Short tab label (max 12 chars)
    options: QuestionOption[]
    multiple?: boolean    // Allow selecting multiple options (NOTE: not 'multiSelect'!)
}

/** Mapped question type for the wizard (with required id) */
export interface WizardQuestion {
    id: string            // Required for wizard: `${requestId}-${index}`
    question: string      // Complete question text
    header: string        // Short tab label (max 12 chars)
    options: QuestionOption[]
    multiple: boolean     // Defaults to false
}

export interface QuestionRequest {
    /** Unique request ID */
    id: string
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
