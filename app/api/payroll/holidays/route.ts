import { NextRequest } from "next/server";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import Holiday from "@/lib/models/Holiday";
import { utcDateKey } from "@/lib/payrollUtils";
import { unauthorized, forbidden, badRequest, notFound, ok, created, isValidId, parseBody } from "@/lib/helpers";

function holidayToCalendarRow(h: {
  name: string;
  date: Date;
  year: number;
  isRecurring: boolean;
  _id: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}, displayYear: number) {
  const src = new Date(h.date);
  const m0 = src.getUTCMonth();
  const d = src.getUTCDate();
  const displayDate = h.isRecurring ? new Date(Date.UTC(displayYear, m0, d, 12, 0, 0, 0)) : src;

  return {
    _id: h._id,
    name: h.name,
    date: displayDate.toISOString(),
    year: h.isRecurring ? displayYear : h.year,
    isRecurring: h.isRecurring,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "holidays_view")) return forbidden();

  const yearParam = req.nextUrl.searchParams.get("year");
  if (yearParam === null || yearParam === "") {
    return badRequest("Query parameter year is required");
  }

  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    return badRequest("Invalid year");
  }

  const rows = await Holiday.find({
    $or: [{ year }, { isRecurring: true }],
  })
    .sort({ date: 1 })
    .lean();

  const seen = new Set<string>();
  const out: ReturnType<typeof holidayToCalendarRow>[] = [];

  for (const h of rows) {
    const row = holidayToCalendarRow(h as Parameters<typeof holidayToCalendarRow>[0], year);
    const src = new Date(h.date as Date);
    const key = h.isRecurring ? utcDateKey(year, src.getUTCMonth(), src.getUTCDate()) : String(h._id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return ok(out);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "holidays_create")) return forbidden();

  const body = await parseBody(req);
  if (body instanceof Response) return body;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  if (!body.date) return badRequest("date is required");
  const date = new Date(body.date);
  if (Number.isNaN(date.getTime())) return badRequest("Invalid date");

  const isRecurring = Boolean(body.isRecurring);
  const year =
    typeof body.year === "number" && Number.isInteger(body.year)
      ? body.year
      : date.getUTCFullYear();

  try {
    const doc = await Holiday.create({
      name,
      date,
      year,
      isRecurring,
    });
    const newHoliday = doc.toObject();
    return created(newHoliday);
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e && (e as { code?: number }).code === 11000
      ? "A holiday already exists on this date"
      : "Failed to create holiday";
    return badRequest(msg);
  }
}

export async function PUT(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "holidays_toggleRecurring")) return forbidden();

  const body = await parseBody(req);
  if (body instanceof Response) return body;

  const id = body.id;
  if (!id || !isValidId(id)) return badRequest("Valid id is required");
  if (typeof body.isRecurring !== "boolean") return badRequest("isRecurring (boolean) is required");

  const doc = await Holiday.findByIdAndUpdate(id, { isRecurring: body.isRecurring }, { new: true }).lean();
  if (!doc) return notFound("Holiday not found");

  return ok(doc);
}

export async function DELETE(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return unauthorized();
  if (!hasPermission(actor, "holidays_delete")) return forbidden();

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Query parameter id is required");
  if (!isValidId(id)) return badRequest("Invalid id");

  const res = await Holiday.findByIdAndDelete(id);
  if (!res) return notFound("Holiday not found");

  return ok({ deleted: true });
}
