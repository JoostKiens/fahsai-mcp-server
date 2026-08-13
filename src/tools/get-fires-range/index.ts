import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FiresToolDeps } from '../../shared/fires/handler.js';
import { FIRES_RANGE_MAX_DAYS, fireSummaryOutputSchema } from '../../shared/fires/schema.js';
import { CALL_GET_LATEST_DATE_FIRST_NOTE } from '../../shared/tool-descriptions.js';
import { createGetFiresRangeHandler } from './handler.js';
import { getFiresRangeInputSchema } from './schema.js';

export function registerGetFiresRange(server: McpServer, deps: FiresToolDeps): void {
  server.registerTool(
    'get_fires_range',
    {
      title: 'Get active fires over a date range',
      description: `Active fire detections (NASA FIRMS) across a date range (max ${FIRES_RANGE_MAX_DAYS} days), filtered by place name or bounding box. Use the \`confidence\` filter (\`low\`/\`nominal\`/\`high\`) to cut FIRMS noise — this is the field for that, not FRP. Returns a total count, a confidence breakdown, and either the full point list or the top fires by fire radiative power (FRP) when the result is large. ${CALL_GET_LATEST_DATE_FIRST_NOTE}`,
      inputSchema: getFiresRangeInputSchema.shape,
      outputSchema: fireSummaryOutputSchema.shape,
    },
    createGetFiresRangeHandler(deps),
  );
}
