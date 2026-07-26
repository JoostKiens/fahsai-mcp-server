import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createFahsaiClient } from './fahsai-client/client.js';
import { createPlaceResolver } from './place-resolver/index.js';
import { registerGetFires } from './tools/get-fires.js';
import { registerGetFiresRange } from './tools/get-fires-range.js';
import { registerGetStationBaseline } from './tools/get-station-baseline.js';
import { registerGetStationHistory } from './tools/get-station-history.js';
import { registerGetStationReadings } from './tools/get-station-readings.js';
import { registerGetStationReadingsHistory } from './tools/get-station-readings-history.js';

const server = new McpServer({ name: 'fahsai-mcp-server', version: '0.1.0' });

const deps = { client: createFahsaiClient(), placeResolver: createPlaceResolver() };

registerGetFires(server, deps);
registerGetFiresRange(server, deps);
registerGetStationReadings(server, deps);
registerGetStationReadingsHistory(server, deps);
registerGetStationHistory(server, deps);
registerGetStationBaseline(server, deps);

await server.connect(new StdioServerTransport());
