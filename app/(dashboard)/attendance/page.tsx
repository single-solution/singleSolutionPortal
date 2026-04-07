import { redirect } from "next/navigation";

export default function AttendanceLegacyRedirect() {
  redirect("/insights-desk/attendance");
}
