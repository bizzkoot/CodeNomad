import { ipcMain, type BrowserWindow } from 'electron';
import type { QuestionInfo, QuestionAnswer } from '../tools/schemas.js';
import type { QuestionBridge } from '../tools/askUser.js';
import type { PendingRequestManager } from '../pending.js';

/**
 * Global reference to the pending manager for IPC handlers
 * This will be set when the bridge is connected
 */
let globalPendingManager: PendingRequestManager | null = null;

/**
 * Setup IPC handlers for MCP bridge in main process
 * This handles communication between the UI (renderer) and the MCP server
 */
export function setupMcpBridge(mainWindow: BrowserWindow): void {
    console.log('[MCP IPC] Setting up main process bridge');

    // Handler: Debug messages from renderer
    ipcMain.on('mcp:debug', (_event, data: any) => {
        const { message, instanceId } = data;
        console.log(`[MCP IPC DEBUG] ${message}${instanceId ? ` (instance: ${instanceId})` : ''}`);
    });

    // Handler: UI sends answer for MCP question
    ipcMain.on('mcp:answer', (_event, data: any) => {
        const { requestId, answers } = data;
        console.log(`[MCP IPC] Received answer from UI: ${requestId}`);

        if (globalPendingManager) {
            const resolved = globalPendingManager.resolve(requestId, answers);
            if (resolved) {
                console.log(`[MCP IPC] Request ${requestId} resolved successfully`);
            } else {
                console.warn(`[MCP IPC] No pending request for answer: ${requestId}`);
            }
        } else {
            console.warn('[MCP IPC] Pending manager not initialized, cannot process answer');
        }
    });

    // Handler: UI sends cancel for MCP question
    ipcMain.on('mcp:cancel', (_event, data: any) => {
        const { requestId } = data;
        console.log(`[MCP IPC] Received cancel from UI: ${requestId}`);

        if (globalPendingManager) {
            const rejected = globalPendingManager.reject(requestId, new Error('cancelled'));
            if (rejected) {
                console.log(`[MCP IPC] Request ${requestId} cancelled successfully`);
                // Notify UI that the question was rejected
                mainWindow.webContents.send('ask_user.rejected', {
                    requestId,
                    reason: 'cancelled',
                    timedOut: false,
                    cancelled: true
                });
            } else {
                console.warn(`[MCP IPC] No pending request for cancel: ${requestId}`);
            }
        } else {
            console.warn('[MCP IPC] Pending manager not initialized, cannot process cancel');
        }
    });

    // Cleanup on window close
    mainWindow.on('closed', () => {
        console.log('[MCP IPC] Window closed, cleaning up pending requests');
        if (globalPendingManager) {
            for (const request of globalPendingManager.getAll()) {
                // Notify UI before rejecting (UI may still receive if not fully destroyed)
                mainWindow.webContents.send('ask_user.rejected', {
                    requestId: request.id,
                    reason: 'session-stop',
                    timedOut: false,
                    cancelled: false
                });
                globalPendingManager.reject(request.id, new Error('Window closed'));
            }
        }
    });

    console.log('[MCP IPC] Main process bridge setup complete');
}

/**
 * Create a bridge that uses IPC to communicate with the UI
 * Call this after MCP server is initialized to connect it to IPC
 */
export function createIpcBridge(mainWindow: BrowserWindow, pendingManager: PendingRequestManager): QuestionBridge {
    console.log('[MCP IPC] Creating IPC bridge for MCP server');

    return {
        sendQuestion: (requestId: string, questions: Array<QuestionInfo & { id: string }>, title?: string) => {
            console.log(`[MCP IPC] Sending question to UI: ${requestId}`);

            // Send to renderer process
            mainWindow.webContents.send('ask_user.asked', {
                requestId,
                questions,
                title,
                source: 'mcp'
            });

            // Create a promise that waits for the answer
            // This will be resolved by the IPC handlers above
            const pending = pendingManager.get(requestId);
            if (pending) {
                // The pending manager already handles the timeout
                // We just need to make sure the promise is set up correctly
                console.log(`[MCP IPC] Question ${requestId} registered in pending manager`);
            } else {
                console.warn(`[MCP IPC] Question ${requestId} not found in pending manager`);
            }
        },
        onAnswer: (callback: (requestId: string, answers: QuestionAnswer[]) => void) => {
            // Already handled via 'mcp:answer' IPC handler in setupMcpBridge
            console.log('[MCP IPC] Answer handler registered (via IPC)');
        },
        onCancel: (callback: (requestId: string) => void) => {
            // Already handled via 'mcp:cancel' IPC handler in setupMcpBridge
            console.log('[MCP IPC] Cancel handler registered (via IPC)');
        }
    };
}

/**
 * Connect the MCP server to IPC
 * This creates an IPC bridge and connects it to the server
 */
export function connectMcpBridge(mcpServer: any, mainWindow: BrowserWindow): void {
    console.log('[MCP IPC] Connecting MCP server to IPC bridge');

    // Get the pending manager from the server
    const pendingManager = mcpServer.getPendingManager();

    // Set global reference for IPC handlers
    globalPendingManager = pendingManager;

    // Create the IPC bridge
    const ipcBridge = createIpcBridge(mainWindow, pendingManager);

    // Connect the bridge to the server
    mcpServer.connectBridge(ipcBridge);

    console.log('[MCP IPC] MCP server connected to IPC bridge');
}
