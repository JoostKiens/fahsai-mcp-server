import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetPowerPlantsHandler, type PowerPlantsToolDeps } from './handler.js';
import { getPowerPlantsInputSchema, powerPlantsOutputSchema } from './schema.js';

export function registerGetPowerPlants(server: McpServer, deps: PowerPlantsToolDeps): void {
  server.registerTool(
    'get_power_plants',
    {
      title: 'Get power plants',
      description:
        'Power plants (WRI dataset: fuel type, capacity in MW, owner, commissioning year) across ' +
        "Fahsai's coverage area (mainland Southeast Asia and surrounding border regions), filtered by " +
        'place name or bounding box. The underlying dataset is global, so results are always scoped to ' +
        "Fahsai's coverage area even when neither `place` nor `bbox` is given. By default returns a " +
        'summary (count, breakdown by country and fuel type, and the top plants by capacity) rather ' +
        'than the full list — set `include_all` to get every matching plant instead (capped).',
      inputSchema: getPowerPlantsInputSchema.shape,
      outputSchema: powerPlantsOutputSchema.shape,
    },
    createGetPowerPlantsHandler(deps),
  );
}
