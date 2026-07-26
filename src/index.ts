import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createFahsaiClient } from './fahsai-client/client.js';
import { createPlaceResolver } from './place-resolver/index.js';
import { registerGetFires } from './tools/get-fires.js';
import { registerGetFiresRange } from './tools/get-fires-range.js';

const server = new McpServer({ name: 'fahsai-mcp-server', version: '0.1.0' });

const deps = { client: createFahsaiClient(), placeResolver: createPlaceResolver() };

registerGetFires(server, deps);
registerGetFiresRange(server, deps);

await server.connect(new StdioServerTransport());
