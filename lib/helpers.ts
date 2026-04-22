import { NextResponse } from "next/server";
import mongoose from "mongoose";

export function forbidden(msg = "Forbidden") {
  return NextResponse.json({ error: msg }, { status: 403 });
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function conflict(msg: string) {
  return NextResponse.json({ error: msg }, { status: 409 });
}

export function unprocessable(msg: string) {
  return NextResponse.json({ error: msg }, { status: 422 });
}

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export function isValidId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}
