import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getVerifiedSession, hasPermission } from "@/lib/permissions";
import Holiday from "@/lib/models/Holiday";
import { utcDateKey } from "@/lib/payrollUtils";
import { isValidId } from "@/lib/helpers";

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
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "holidays_view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const yearParam = req.nextUrl.searchParams.get("year");
  if (yearParam === null || yearParam === "") {
    return NextResponse.json({ error: "Query parameter year is required" }, { status: 400 });
  }

  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 1970 || year > 9999) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  await connectDB();

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

  return NextResponse.json(out);
}

export async function POST(req: Request) {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "holidays_manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectDB();

  let body: { name?: string; date?: string; year?: number; isRecurring?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  if (!body.date) return NextResponse.json({ error: "date is required" }, { status: 400 });
  const date = new Date(body.date);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

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
    return NextResponse.json(doc.toObject(), { status: 201 });
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e && (e as { code?: number }).code === 11000
      ? "A holiday already exists on this date"
      : "Failed to create holiday";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const actor = await getVerifiedSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "holidays_manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Query parameter id is required" }, { status: 400 });
  if (!isValidId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await connectDB();

  const res = await Holiday.findByIdAndDelete(id);
  if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
