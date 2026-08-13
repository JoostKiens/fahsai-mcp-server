import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { FiresToolDeps } from '../../shared/fires/handler.js';
import { fireSummaryOutputSchema } from '../../shared/fires/schema.js';
import { CALL_GET_LATEST_DATE_FIRST_NOTE } from '../../shared/tool-descriptions.js';
import { createGetFiresHandler } from './handler.js';
import { getFiresInputSchema } from './schema.js';

export function registerGetFires(server: McpServer, deps: FiresToolDeps): void {
  server.registerTool(
    'get_fires',
    {
      title: 'Get active fires',
      description: `Active fire detections (NASA FIRMS) for a single date, filtered by place name or bounding box. Use the \`confidence\` filter (\`low\`/\`nominal\`/\`high\`) to cut FIRMS noise — this is the field for that, not FRP. Returns a total count, a confidence breakdown, and either the full point list or the top fires by fire radiative power (FRP) when the result is large. ${CALL_GET_LATEST_DATE_FIRST_NOTE}`,
      inputSchema: getFiresInputSchema.shape,
      outputSchema: fireSummaryOutputSchema.shape,
    },
    createGetFiresHandler(deps),
  );
}
