import { ipcMain, type BrowserWindow } from 'electron';
import type { QuestionInfo, QuestionAnswer } from '../tools/schemas.js';
import type { IpcBridgeMain } from './types.js';

/**
 * Map of pending requests with Promise resolvers
 */
const pendingRequests = new Map<string, {
    resolve: (result: PendingRequestResult) => void;
    reject: (error: Error) => void;
}>();

interface PendingRequestResult {
    answered: boolean;
    cancelled: boolean;
    timedOut: boolean;
    answers: QuestionAnswer[];
}

/**
 * Setup IPC handlers for MCP bridge in main process
 */
export function setupMcpBridge(mainWindow: BrowserWindow): void {
    console.log('[MCP IPC] Setting up main process bridge');

    // Handler: MCP Server sends question to UI
    ipcMain.handle('mcp:send-question', async (_event, payload: any) => {
        const { requestId, questions, title, timeout }: { requestId: string; questions: any[]; title?: string; timeout?: number } = payload as any;
        console.log(`[MCP IPC] Received question from MCP server: ${requestId}`);

        // Send to renderer
        mainWindow.webContents.send('cn_ask_user.asked', {
            requestId: requestId as string,
            questions: questions as any[],
            title: title as string | undefined,
            source: 'mcp'
        });

        // Wait for answer from UI
        return new Promise<PendingRequestResult>((resolve: (result: PendingRequestResult) => void) => {
            pendingRequests.set(requestId, { resolve, reject: () => {} });

            // Timeout handling
            const timeoutMs = timeout || 300000;
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    console.log(`[MCP IPC] Request timeout: ${requestId}`);
                    pendingRequests.delete(requestId);
                    resolve({
                        answered: false,
                        cancelled: false,
                        timedOut: true,
                        answers: []
                    });
                }
            }, timeoutMs);
        });
    });

    // Handler: UI sends answer for MCP question
    ipcMain.on('mcp:answer', (_event, data: any) => {
        const { requestId, answers } = data;
        console.log(`[MCP IPC] Received answer from UI: ${requestId}`);
        const pending = pendingRequests.get(requestId);
        if (pending) {
            pendingRequests.delete(requestId);
            pending.resolve({
                answered: true,
                cancelled: false,
                timedOut: false,
                answers
            });
        } else {
            console.warn(`[MCP IPC] No pending request for answer: ${requestId}`);
        }
    });

    // Handler: UI sends cancel for MCP question
    ipcMain.on('mcp:cancel', (_event, data: any) => {
        const { requestId } = data;
        console.log(`[MCP IPC] Received cancel from UI: ${requestId}`);
        const pending = pendingRequests.get(requestId);
        if (pending) {
            pendingRequests.delete(requestId);
            pending.resolve({
                answered: false,
                cancelled: true,
                timedOut: false,
                answers: []
            });
        } else {
            console.warn(`[MCP IPC] No pending request for cancel: ${requestId}`);
        }
    });

    // Cleanup on window close
    mainWindow.on('closed', () => {
        console.log('[MCP IPC] Window closed, cleaning up pending requests');
        for (const [id, pending] of pendingRequests.entries()) {
            pending.resolve({
                answered: false,
                cancelled: true,
                timedOut: false,
                answers: []
            });
        }
        pendingRequests.clear();
    });

    console.log('[MCP IPC] Main process bridge setup complete');
}

/**
 * Update bridge reference in server to use IPC
 * Call this after MCP server is initialized
 */
export function connectMcpBridge(mcpServer: any, mainWindow: BrowserWindow): void {
    console.log('[MCP IPC] Connecting MCP server to IPC bridge');

    mcpServer.bridge = {
        sendQuestion: (requestId: string, questions: Array<QuestionInfo & { id: string }>, title?: string) => {
            mainWindow.webContents.send('cn_ask_user.asked', {
                requestId,
                questions,
                title,
                source: 'mcp'
            });
        },
        onAnswer: (callback: (requestId: string, answers: QuestionAnswer[]) => void) => {
            // Already handled via 'mcp:answer' IPC
            console.log('[MCP IPC] Answer handler registered (via IPC)');
        },
        onCancel: (callback: (requestId: string) => void) => {
            // Already handled via 'mcp:cancel' IPC
            console.log('[MCP IPC] Cancel handler registered (via IPC)');
        }
    };
}
