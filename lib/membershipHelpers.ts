/** Shared membership query utilities. */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function populateMembership(query: any) {
  return query
    .populate("user", "about.firstName about.lastName email username")
    .populate("department", "title")
    .populate("designation", "name color defaultPermissions");
}
