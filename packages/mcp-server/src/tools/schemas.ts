import { z } from 'zod';

/**
 * Question types supported by the ask_user tool
 */
export type QuestionType = 'text' | 'select' | 'multi-select' | 'confirm';

/**
 * Single question definition
 */
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

/**
 * Tool input schema for ask_user
 */
export const CnAskUserInputSchema = z.object({
    questions: z.array(QuestionInfoSchema).min(1).max(10),
    title: z.string().max(100).optional(),
});

/**
 * Tool output schema
 */
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

// Export inferred types
export type QuestionInfo = z.infer<typeof QuestionInfoSchema>;
export type CnAskUserInput = z.infer<typeof CnAskUserInputSchema>;
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;
export type CnAskUserOutput = z.infer<typeof CnAskUserOutputSchema>;
