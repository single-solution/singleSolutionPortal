import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/models/User";
import mongoose from "mongoose";

export async function getSession() {
  return auth();
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export function requireRole(role: UserRole, allowed: UserRole[]) {
  return allowed.includes(role);
}

export function isValidId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}
