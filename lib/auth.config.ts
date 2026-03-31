import type { NextAuthConfig } from "next-auth";

const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password", "/setup-password", "/preview"];
const ADMIN_ONLY = ["/employees", "/departments", "/teams", "/campaigns"];
const ADMIN_ROLES = ["superadmin", "manager", "teamLead"];

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

      if (isPublic) {
        if (isLoggedIn && pathname === "/login") {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) return false;

      const role = (auth?.user as Record<string, unknown>)?.role as string | undefined;
      const isAdminRoute = ADMIN_ONLY.some((p) => pathname.startsWith(p));
      if (isAdminRoute && role && !ADMIN_ROLES.includes(role)) {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
};
