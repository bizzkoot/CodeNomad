import type { QuestionInfo, QuestionAnswer } from '../tools/schemas.js';
import type { IpcBridgeRenderer } from './types.js';

// Type declarations for Electron APIs
declare global {
    interface Window {
        require: (module: string) => any;
        dispatchEvent: (event: Event) => void;
    }
}

/**
 * Initialize renderer-side IPC listeners
 */
export function initMcpBridge(instanceId: string): void {
    console.log(`[MCP Bridge Renderer] Initializing for instance: ${instanceId}`);

    // Check if we're in Electron environment
    if (typeof window === 'undefined' || !window.require) {
        console.warn('[MCP Bridge Renderer] Not in Electron environment, skipping MCP bridge');
        return;
    }

    try {
        const { ipcRenderer } = window.require('electron');

        console.log('[MCP Bridge Renderer] Setting up IPC listeners');

        // Listen for questions from MCP server (via main process)
        ipcRenderer.on('cn_ask_user.asked', (_event, payload: any) => {
            console.log('[MCP Bridge Renderer] Received question:', payload);

            // Map MCP question format to CodeNomad question format
            const { requestId, questions, title, source } = payload;

            // Add to existing question queue
            // This will be connected to actual store in Phase 4
            if (window.dispatchEvent) {
                const event = new CustomEvent('mcp-question-received');
                window.dispatchEvent(event);
            }
        });

        console.log('[MCP Bridge Renderer] Initialized successfully');
    } catch (error) {
        console.error('[MCP Bridge Renderer] Failed to initialize:', error);
    }
}

/**
 * Send answer to main process (for MCP questions)
 */
export function sendMcpAnswer(requestId: string, answers: QuestionAnswer[]): void {
    console.log(`[MCP Bridge Renderer] Sending answer: ${requestId}`);

    try {
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('mcp:answer', { requestId, answers });
        }
    } catch (error) {
        console.error('[MCP Bridge Renderer] Failed to send answer:', error);
    }
}

/**
 * Send cancel to main process (for MCP questions)
 */
export function sendMcpCancel(requestId: string): void {
    console.log(`[MCP Bridge Renderer] Sending cancel: ${requestId}`);

    try {
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.send('mcp:cancel', { requestId });
        }
    } catch (error) {
        console.error('[MCP Bridge Renderer] Failed to send cancel:', error);
    }
}
