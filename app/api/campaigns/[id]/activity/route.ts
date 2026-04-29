import { NextRequest } from "next/server";
import ActivityLog from "@/lib/models/ActivityLog";
import Campaign from "@/lib/models/Campaign";
import { unauthorized, forbidden, notFound, ok, badRequest, isValidId } from "@/lib/helpers";
import { safeParseInt } from "@/lib/validation";
import {
  getVerifiedSession,
  hasPermission,
  getCampaignScopeFilter,
} from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "campaigns_view")) return forbidden();

  const { id } = await params;
  if (!isValidId(id)) return badRequest("Invalid campaign ID");

  const scopeFilter = await getCampaignScopeFilter(actor);
  const campaign = await Campaign.findOne({ _id: id, ...scopeFilter }).select("_id").lean();
  if (!campaign) return notFound("Campaign not found");

  const limit = Math.min(safeParseInt(req.nextUrl.searchParams.get("limit"), 7), 30);

  const logs = await ActivityLog.find({ entity: "campaign", entityId: id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return ok({ logs });
}
