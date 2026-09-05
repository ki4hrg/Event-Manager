import { accessibleTenantsForUser } from "@/lib/tenant";
import type { McpToolDefinition } from "./types";

// The one tool that runs outside a tenant: it tells the caller which `tenant`
// values every other tool accepts. The dispatcher exempts it from tenant
// resolution (see TENANT_FREE_TOOLS in ./index.ts).
export const tenantTools: McpToolDefinition[] = [
  {
    name: "list_tenants",
    description:
      "List the organizations (tenants) this API key's user belongs to. Every other tool takes a `tenant` argument (slug or id) naming which organization to act in; it may be omitted only when the user belongs to exactly one. Call this first when unsure.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId }) => {
      const { tenants, isSuperAdmin } = await accessibleTenantsForUser(userId);
      return { isSuperAdmin, tenants };
    },
  },
];
