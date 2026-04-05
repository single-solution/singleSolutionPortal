import { redirect } from "next/navigation";

/** Old /teams hub removed — org structure uses departments + leads; cross-cutting work is modeled on Campaigns. */
export default function TeamsPageRedirect() {
  redirect("/campaigns");
}
