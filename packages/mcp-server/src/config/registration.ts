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
 */
export function writeMcpConfig(port: number, token: string): void {
    const configPath = getMcpConfigPath();

    try {
        // Read existing config
        let config = readMcpConfig();

        // Ensure mcpServers object exists
        if (!config.mcpServers) {
            config.mcpServers = {};
        }

        // Get path to our built MCP server
        // registration.ts compiles to dist/config/, so __dirname is dist/config/
        // We need to go up to dist/ and then index.js
        const mcpServerPath = path.join(__dirname, '..', 'index.js');
        const absoluteMcpServerPath = path.resolve(mcpServerPath);

        // Add ask_user tool entry
        config.mcpServers['ask-user'] = {
            command: 'node',
            args: [
                absoluteMcpServerPath,
                '--port', String(port),
                '--token', token
            ]
        };

        // Ensure directory exists
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        // Write config atomically
        const tempPath = configPath + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(config, null, 2));

        // Atomic rename
        fs.renameSync(tempPath, configPath);

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
