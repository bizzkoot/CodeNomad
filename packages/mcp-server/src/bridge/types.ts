import type { QuestionInfo, QuestionAnswer } from '../tools/schemas.js';

/**
 * Bridge interface for MCP server ↔ UI communication
 */
export interface QuestionBridge {
    /**
     * Send question from MCP server to UI
     */
    sendQuestion(requestId: string, questions: Array<QuestionInfo & { id: string }>, title?: string): void;

    /**
     * Register callback for when user answers
     */
    onAnswer(callback: (requestId: string, answers: QuestionAnswer[]) => void): void;

    /**
     * Register callback for when user cancels
     */
    onCancel(callback: (requestId: string) => void): void;
}

/**
 * Main process IPC bridge interface
 */
export interface IpcBridgeMain {
    /**
     * Setup IPC handlers for MCP bridge
     */
    setup(): void;

    /**
     * Send answer from UI to pending request
     */
    handleAnswer(requestId: string, answers: QuestionAnswer[]): void;

    /**
     * Send cancel from UI to pending request
     */
    handleCancel(requestId: string): void;
}

/**
 * Renderer process IPC bridge interface
 */
export interface IpcBridgeRenderer {
    /**
     * Initialize renderer-side IPC listeners
     */
    init(): void;

    /**
     * Send answer to main process
     */
    sendAnswer(requestId: string, answers: QuestionAnswer[]): void;

    /**
     * Send cancel to main process
     */
    sendCancel(requestId: string): void;
}
