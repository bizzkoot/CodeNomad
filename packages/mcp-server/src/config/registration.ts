import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface McpServerConfig {
    command: string;
    args: string[];
}

/**
 * Get MCP config file path
 */
export function getMcpConfigPath(): string {
    return path.join(
        os.homedir(),
        '.gemini',
        'antigravity',
        'mcp_config.json'
    );
}

/**
 * Read existing MCP config
 */
export function readMcpConfig(): { mcpServers: Record<string, McpServerConfig> } {
    const configPath = getMcpConfigPath();

    if (!fs.existsSync(configPath)) {
        return { mcpServers: {} };
    }

    try {
        const content = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn('[MCP Config] Failed to read existing config:', error);
        return { mcpServers: {} };
    }
}

/**
 * Write MCP config with CodeNomad entry
 * 
 * @param port - MCP server port
 * @param token - MCP server auth token  
 * @param serverPath - Absolute path to the MCP server entry point (server.js)
 */
export function writeMcpConfig(port: number, token: string, serverPath?: string): void {
    const configPath = getMcpConfigPath();

    try {
        // Read existing config
        let config = readMcpConfig();

        // Ensure mcpServers object exists
        if (!config.mcpServers) {
            config.mcpServers = {};
        }

        // Use provided server path, or try to resolve it
        let mcpServerPath = serverPath;
        if (!mcpServerPath) {
            // Fallback: try to find it relative to this file
            // registration.ts compiles to dist/config/, so __dirname is dist/config/
            mcpServerPath = path.join(__dirname, '..', 'server.js');
        }
        const absoluteMcpServerPath = path.resolve(mcpServerPath);

        console.log(`[MCP Config] Using server path: ${absoluteMcpServerPath}`);

        // Add ask_user tool entry
        config.mcpServers['ask-user'] = {
            command: 'node',
            args: [
                absoluteMcpServerPath,
                '--port', String(port),
                '--token', token
            ]
        };

        console.log(`[MCP Config] Config to write:`, JSON.stringify(config, null, 2));

        // Ensure directory exists
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            console.log(`[MCP Config] Creating directory: ${configDir}`);
            fs.mkdirSync(configDir, { recursive: true });
        }

        // Write config atomically
        const tempPath = configPath + '.tmp';
        console.log(`[MCP Config] Writing to temp file: ${tempPath}`);
        fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
        console.log(`[MCP Config] Temp file written successfully`);

        // Atomic rename
        console.log(`[MCP Config] Renaming ${tempPath} -> ${configPath}`);
        fs.renameSync(tempPath, configPath);
        console.log(`[MCP Config] File renamed successfully`);

        // Verify the write
        if (fs.existsSync(configPath)) {
            const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`[MCP Config] Verification: ask-user entry exists:`, !!writtenConfig.mcpServers['ask-user']);
        } else {
            console.error(`[MCP Config] ERROR: Config file does not exist after write!`);
        }

        console.log(`[MCP Config] Registered with Antigravity on port ${port}`);
    } catch (error) {
        console.error('[MCP Config] Failed to write config:', error);
    }
}

/**
 * Remove CodeNomad entry from MCP config
 */
export function unregisterFromMcpConfig(): void {
    const configPath = getMcpConfigPath();

    try {
        if (!fs.existsSync(configPath)) {
            console.log('[MCP Config] No config file found, nothing to unregister');
            return;
        }

        const config = readMcpConfig();

        if (config.mcpServers && config.mcpServers['ask-user']) {
            delete config.mcpServers['ask-user'];

            // Write back config
            const tempPath = configPath + '.tmp';
            fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));
            fs.renameSync(tempPath, configPath);

            console.log('[MCP Config] Unregistered from Antigravity');
        }
    } catch (error) {
        console.error('[MCP Config] Failed to unregister:', error);
    }
}
