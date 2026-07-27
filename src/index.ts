import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createFahsaiClient } from './shared/fahsai-client/client.js';
import { createPlaceResolver } from './shared/place-resolver/index.js';
import { registerGeocodePlace } from './tools/geocode-place/index.js';
import { registerGetFires } from './tools/get-fires/index.js';
import { registerGetFiresRange } from './tools/get-fires-range/index.js';
import { registerGetStationBaseline } from './tools/get-station-baseline/index.js';
import { registerGetStationHistory } from './tools/get-station-history/index.js';
import { registerGetStationReadings } from './tools/get-station-readings/index.js';
import { registerGetStationReadingsHistory } from './tools/get-station-readings-history/index.js';
import { registerGetStations } from './tools/get-stations/index.js';
import { registerGetWeather } from './tools/get-weather/index.js';

const server = new McpServer({ name: 'fahsai-mcp-server', version: '0.1.0' });

const deps = { client: createFahsaiClient(), placeResolver: createPlaceResolver() };

registerGetFires(server, deps);
registerGetFiresRange(server, deps);
registerGetStationReadings(server, deps);
registerGetStationReadingsHistory(server, deps);
registerGetStationHistory(server, deps);
registerGetStationBaseline(server, deps);
registerGetStations(server, deps);
registerGetWeather(server, deps);
registerGeocodePlace(server, deps);

await server.connect(new StdioServerTransport());
