-- Hierarchical sequential approval chain for travel orders.
-- Shape: [{ "level": 1, "agentId": "...", "approvedAt": null, "approvedByAgentId": null }, ...]
ALTER TABLE "travel_orders" ADD COLUMN IF NOT EXISTS "approval_levels" JSONB NOT NULL DEFAULT '[]'::jsonb;
