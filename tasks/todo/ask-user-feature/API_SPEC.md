# API Specification: `ask_user` MCP Tool

**Version:** 1.0  
**Date:** 2026-01-18  

---

## Overview

This document specifies the API for the `ask_user` MCP tool, including input schema, output schema, error handling, and example usage.

---

## Tool Registration

### MCP Tool Definition

```json
{
    "name": "ask_user",
    "description": "Ask the user questions through CodeNomad's interface. Use this tool when you need user input, clarification, or confirmation before proceeding. The tool blocks until the user responds.",
    "inputSchema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "description": "Array of questions to ask the user",
                "items": {
                    "$ref": "#/definitions/QuestionInfo"
                },
                "minItems": 1,
                "maxItems": 10
            },
            "title": {
                "type": "string",
                "description": "Optional title for the question dialog",
                "maxLength": 100
            },
            "timeout": {
                "type": "integer",
                "description": "Timeout in milliseconds (default: 300000 = 5 minutes)",
                "minimum": 10000,
                "maximum": 1800000,
                "default": 300000
            }
        },
        "required": ["questions"],
        "definitions": {
            "QuestionInfo": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Optional unique ID for this question"
                    },
                    "question": {
                        "type": "string",
                        "description": "The question text to display"
                    },
                    "type": {
                        "type": "string",
                        "enum": ["text", "select", "multi-select", "confirm"],
                        "default": "text",
                        "description": "Type of input to collect"
                    },
                    "options": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Options for select/multi-select types"
                    },
                    "required": {
                        "type": "boolean",
                        "default": true,
                        "description": "Whether an answer is required"
                    },
                    "placeholder": {
                        "type": "string",
                        "description": "Placeholder text for text inputs"
                    }
                },
                "required": ["question"]
            }
        }
    }
}
```

---

## Input Schema

### TypeScript Definition

```typescript
interface CnAskUserInput {
    /**
     * Array of questions to ask the user.
     * Minimum 1, maximum 10 questions.
     */
    questions: QuestionInfo[];
    
    /**
     * Optional title for the question dialog.
     * Displayed at the top of the question wizard.
     */
    title?: string;
    
    /**
     * Timeout in milliseconds.
     * If user doesn't respond within this time, returns timeout result.
     * Default: 300000 (5 minutes)
     * Range: 10000 - 1800000 (10 seconds to 30 minutes)
     */
    timeout?: number;
}

interface QuestionInfo {
    /**
     * Optional unique identifier for this question.
     * If not provided, one will be generated.
     */
    id?: string;
    
    /**
     * The question text to display to the user.
     * Supports basic markdown formatting.
     */
    question: string;
    
    /**
     * Type of input to collect.
     * - text: Free-form text input
     * - select: Single selection from options
     * - multi-select: Multiple selection from options
     * - confirm: Yes/No confirmation
     */
    type?: 'text' | 'select' | 'multi-select' | 'confirm';
    
    /**
     * Available options for select/multi-select types.
     * Required when type is 'select' or 'multi-select'.
     */
    options?: string[];
    
    /**
     * Whether an answer is required.
     * If false, user can skip this question.
     * Default: true
     */
    required?: boolean;
    
    /**
     * Placeholder text for text inputs.
     */
    placeholder?: string;
}
```

### Zod Schema

```typescript
import { z } from 'zod';

export const QuestionInfoSchema = z.object({
    id: z.string().optional(),
    question: z.string().min(1).max(1000),
    type: z.enum(['text', 'select', 'multi-select', 'confirm']).optional().default('text'),
    options: z.array(z.string()).optional(),
    required: z.boolean().optional().default(true),
    placeholder: z.string().optional(),
}).refine(
    (data) => {
        // Options required for select types
        if (data.type === 'select' || data.type === 'multi-select') {
            return data.options && data.options.length > 0;
        }
        return true;
    },
    { message: "Options required for select/multi-select types" }
);

export const CnAskUserInputSchema = z.object({
    questions: z.array(QuestionInfoSchema).min(1).max(10),
    title: z.string().max(100).optional(),
    timeout: z.number().int().min(10000).max(1800000).optional().default(300000),
});

export type QuestionInfo = z.infer<typeof QuestionInfoSchema>;
export type CnAskUserInput = z.infer<typeof CnAskUserInputSchema>;
```

---

## Output Schema

### TypeScript Definition

```typescript
interface CnAskUserOutput {
    /**
     * True if user provided answers.
     */
    answered: boolean;
    
    /**
     * True if user explicitly cancelled.
     */
    cancelled: boolean;
    
    /**
     * True if timeout was reached before user responded.
     */
    timedOut: boolean;
    
    /**
     * Array of answers, one per question.
     * Empty if cancelled or timed out.
     */
    answers: QuestionAnswer[];
}

interface QuestionAnswer {
    /**
     * ID of the question this answer corresponds to.
     */
    questionId: string;
    
    /**
     * Selected/entered values.
     * - For text: Single-element array with the text
     * - For select: Single-element array with selected option
     * - For multi-select: Array of selected options
     * - For confirm: ["yes"] or ["no"]
     */
    values: string[];
    
    /**
     * Custom text if user provided additional input.
     * Some question types allow "Other: [custom]" responses.
     */
    customText?: string;
}
```

### Zod Schema

```typescript
export const QuestionAnswerSchema = z.object({
    questionId: z.string(),
    values: z.array(z.string()),
    customText: z.string().optional(),
});

export const CnAskUserOutputSchema = z.object({
    answered: z.boolean(),
    cancelled: z.boolean(),
    timedOut: z.boolean(),
    answers: z.array(QuestionAnswerSchema),
});

export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;
export type CnAskUserOutput = z.infer<typeof CnAskUserOutputSchema>;
```

---

## Examples

### Example 1: Simple Text Question

**Input:**
```json
{
    "questions": [
        {
            "question": "What would you like to name this function?",
            "type": "text",
            "placeholder": "e.g., processUserData"
        }
    ]
}
```

**Output (user answers):**
```json
{
    "answered": true,
    "cancelled": false,
    "timedOut": false,
    "answers": [
        {
            "questionId": "q_123abc",
            "values": ["handleUserSubmission"]
        }
    ]
}
```

### Example 2: Single Selection

**Input:**
```json
{
    "questions": [
        {
            "question": "Which framework would you prefer?",
            "type": "select",
            "options": ["React", "Vue", "Svelte", "Solid"]
        }
    ],
    "title": "Framework Selection"
}
```

**Output:**
```json
{
    "answered": true,
    "cancelled": false,
    "timedOut": false,
    "answers": [
        {
            "questionId": "q_456def",
            "values": ["Solid"]
        }
    ]
}
```

### Example 3: Confirmation

**Input:**
```json
{
    "questions": [
        {
            "question": "This will delete 15 files. Are you sure?",
            "type": "confirm"
        }
    ],
    "title": "Confirm Deletion"
}
```

**Output (user confirms):**
```json
{
    "answered": true,
    "cancelled": false,
    "timedOut": false,
    "answers": [
        {
            "questionId": "q_789ghi",
            "values": ["yes"]
        }
    ]
}
```

**Output (user declines):**
```json
{
    "answered": true,
    "cancelled": false,
    "timedOut": false,
    "answers": [
        {
            "questionId": "q_789ghi",
            "values": ["no"]
        }
    ]
}
```

### Example 4: Multiple Questions

**Input:**
```json
{
    "questions": [
        {
            "id": "name",
            "question": "What should the component be called?",
            "type": "text"
        },
        {
            "id": "style",
            "question": "Which styling approach?",
            "type": "select",
            "options": ["CSS Modules", "Styled Components", "Tailwind", "Plain CSS"]
        },
        {
            "id": "features",
            "question": "Which features should be included?",
            "type": "multi-select",
            "options": ["Loading state", "Error handling", "Animation", "Accessibility"]
        }
    ],
    "title": "Component Configuration"
}
```

**Output:**
```json
{
    "answered": true,
    "cancelled": false,
    "timedOut": false,
    "answers": [
        {
            "questionId": "name",
            "values": ["UserProfileCard"]
        },
        {
            "questionId": "style",
            "values": ["Tailwind"]
        },
        {
            "questionId": "features",
            "values": ["Loading state", "Error handling", "Accessibility"]
        }
    ]
}
```

### Example 5: User Cancels

**Input:**
```json
{
    "questions": [
        {
            "question": "Any additional requirements?"
        }
    ]
}
```

**Output:**
```json
{
    "answered": false,
    "cancelled": true,
    "timedOut": false,
    "answers": []
}
```

### Example 6: Timeout

**Input:**
```json
{
    "questions": [
        {
            "question": "Please confirm within 30 seconds",
            "type": "confirm"
        }
    ],
    "timeout": 30000
}
```

**Output (after 30 seconds):**
```json
{
    "answered": false,
    "cancelled": false,
    "timedOut": true,
    "answers": []
}
```

---

## Error Handling

### Validation Errors

If input validation fails, the tool returns an error result:

```json
{
    "isError": true,
    "content": [
        {
            "type": "text",
            "text": "Validation error: questions array must have at least 1 item"
        }
    ]
}
```

### Common Validation Errors

| Error                                       | Cause                           | Solution                      |
| ------------------------------------------- | ------------------------------- | ----------------------------- |
| `questions array must have at least 1 item` | Empty questions array           | Provide at least one question |
| `questions array exceeds maximum of 10`     | Too many questions              | Split into multiple calls     |
| `Options required for select/multi-select`  | Missing options for select type | Add options array             |
| `question text is required`                 | Empty question string           | Provide question text         |

---

## Best Practices

### For LLM/Agent Developers

1. **Keep questions concise**: Users prefer short, clear questions
2. **Use appropriate types**: Don't use text when select would be clearer
3. **Limit questions per call**: Ask only what's needed (1-3 questions ideal)
4. **Provide good options**: For select types, cover common cases
5. **Handle all outcomes**: Check `cancelled` and `timedOut` flags
6. **Use meaningful titles**: Help users understand context

### Example Prompt Usage

```markdown
When you need user input:
1. Use the ask_user tool
2. Ask clear, specific questions
3. Handle the response appropriately:
   - If answered: proceed with user's input
   - If cancelled: acknowledge and ask if user wants to proceed differently
   - If timed out: inform user and offer to try again
```

---

## MCP Tool Result Format

The tool returns results in MCP's `LanguageModelToolResult` format:

```typescript
return {
    content: [
        {
            type: "text",
            text: JSON.stringify({
                answered: true,
                cancelled: false,
                timedOut: false,
                answers: [...]
            })
        }
    ]
};
```

This ensures the result is passed back to the LLM **within the same request stream**, avoiding additional premium requests.
