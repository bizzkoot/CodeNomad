import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'http';
import * as crypto from 'crypto';
import { CnAskUserInputSchema, type CnAskUserInput, type CnAskUserOutput } from './tools/schemas.js';
import { askUser, type QuestionBridge } from './tools/askUser.js';
import { PendingRequestManager } from './pending.js';

export interface ServerConfig {
    port?: number;
    host?: string;
}

export class CodeNomadMcpServer {
    private mcpServer: McpServer | null = null;
    private httpServer: HttpServer | null = null;
    private transport: StreamableHTTPServerTransport | null = null;
    private port: number | undefined;
    private authToken: string | undefined = undefined;
    private pendingManager: PendingRequestManager;
    private bridge: QuestionBridge;

    constructor(config: ServerConfig = {}) {
        this.pendingManager = new PendingRequestManager();
        this.bridge = {
            sendQuestion: (requestId, questions, title) => {
                console.log(`[MCP] Sending question to UI: ${requestId}`);
                // TODO: Will be connected to Electron IPC bridge
            },
            onAnswer: (callback) => {
                console.log('[MCP] Answer handler registered');
                // TODO: Will be connected to Electron IPC bridge
            },
            onCancel: (callback) => {
                console.log('[MCP] Cancel handler registered');
                // TODO: Will be connected to Electron IPC bridge
            }
        };
    }

    /**
     * Start the MCP server
     */
    async start(): Promise<void> {
        console.log('[MCP] Starting CodeNomad MCP Server...');

        // Find available port
        this.port = await this.findAvailablePort();
        console.log(`[MCP] Using port: ${this.port}`);

        // Generate auth token
        this.authToken = crypto.randomBytes(32).toString('hex');
        console.log(`[MCP] Generated auth token: ${this.authToken.substring(0, 8)}...`);

        // Create MCP server
        this.mcpServer = new McpServer({
            name: "CodeNomad Ask User",
            version: "1.0.0"
        });

        // Register tools
        this.registerTools();

        // Create transport
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => `sess_${crypto.randomUUID()}`
        });

        // Connect server to transport
        await this.mcpServer.connect(this.transport);
        console.log('[MCP] MCP Server connected to transport');

        // Create HTTP server
        this.httpServer = createHttpServer(async (req, res) => {
            await this.handleHttpRequest(req, res);
        });

        // Start listening
        await new Promise<void>((resolve) => {
            this.httpServer!.listen(this.port!, '127.0.0.1', () => {
                console.log(`[MCP] HTTP server listening on http://127.0.0.1:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
        console.log('[MCP] Stopping CodeNomad MCP Server...');

        // Cleanup pending requests
        for (const req of this.pendingManager.getAll()) {
            this.pendingManager.reject(req.id, new Error('Server shutting down'));
        }

        // Close HTTP server
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        // Close transport
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }

        this.mcpServer = null;
        console.log('[MCP] Server stopped');
    }

    /**
     * Get server port
     */
    getPort(): number | undefined {
        return this.port;
    }

    /**
     * Get auth token
     */
    getAuthToken(): string | undefined {
        return this.authToken;
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return this.mcpServer !== null;
    }

    /**
     * Register all MCP tools
     */
    private registerTools(): void {
        this.mcpServer!.registerTool(
            "ask_user",
            {
                description: "Ask the user questions through CodeNomad's interface. Use this tool when you need user input, clarification, or confirmation before proceeding. The tool blocks until the user responds.",
                inputSchema: {
                    type: "object",
                    properties: {
                        questions: {
                            type: "array",
                            description: "Array of questions to ask user",
                            items: {
                                type: "object",
                                properties: {
                                    question: { type: "string" },
                                    type: { type: "string", enum: ["text", "select", "multi-select", "confirm"] },
                                    options: { type: "array", items: { type: "string" } },
                                    required: { type: "boolean" },
                                    placeholder: { type: "string" }
                                },
                                required: ["question"]
                            },
                            minItems: 1,
                            maxItems: 10
                        },
                        title: {
                            type: "string",
                            description: "Optional title for question dialog",
                            maxLength: 100
                        },
                        timeout: {
                            type: "number",
                            description: "Timeout in milliseconds (default: 300000 = 5 minutes)",
                            minimum: 10000,
                            maximum: 1800000
                        }
                    },
                    required: ["questions"]
                } as any
            },
            async (args: any) => {
                try {
                    console.log(`[MCP] Tool invoked: ask_user`);
                    // Validate input with Zod
                    const validatedInput = CnAskUserInputSchema.parse(args);
                    const result = await askUser(validatedInput, this.bridge, this.pendingManager);
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify(result)
                        }]
                    } as any;
                } catch (error) {
                    console.error(`[MCP] Tool error:`, error);
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify({
                                answered: false,
                                cancelled: false,
                                timedOut: false,
                                answers: [],
                                error: error instanceof Error ? error.message : String(error)
                            })
                        }],
                        isError: true
                    } as any;
                }
            }
        );

        console.log('[MCP] Registered tool: ask_user');
    }

    /**
     * Handle HTTP requests
     */
    private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = req.url || '/';
        const method = req.method || 'GET';

        console.log(`[MCP] Request: ${method} ${url}`);

        // Health check endpoint
        if (url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'running',
                port: this.port,
                pendingRequests: this.pendingManager.count()
            }));
            return;
        }

        // Handle CORS preflight
        if (method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
                'Access-Control-Max-Age': '86400'
            });
            res.end();
            return;
        }

        // Add CORS headers to all responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

        // Route ALL other requests to MCP transport (including root path)
        // OpenCode's StreamableHTTPClientTransport expects to connect at the root
        try {
            console.log(`[MCP] Forwarding to transport: ${method} ${url}`);
            await this.transport?.handleRequest(req, res);
        } catch (error) {
            console.error(`[MCP] Transport error:`, error);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        }
    }

    /**
     * Find an available port
     */
    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = createHttpServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (address && typeof address !== 'string') {
                    const port = address.port;
                    server.close(() => resolve(port));
                } else {
                    reject(new Error('Failed to get port'));
                }
            });
            server.on('error', reject);
        });
    }
}
