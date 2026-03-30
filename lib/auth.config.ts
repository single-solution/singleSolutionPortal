import type { NextAuthConfig } from "next-auth";

const ADMIN_ONLY = ["/dashboard/employees", "/dashboard/departments"];
const ADMIN_ROLES = ["superadmin", "manager"];

export const authConfig: NextAuthConfig = {
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
      const isDashboard = nextUrl.pathname.startsWith("/dashboard");

      if (isDashboard) {
        if (!isLoggedIn) return false;

        const role = (auth?.user as Record<string, unknown>)?.role as string | undefined;
        const isAdminRoute = ADMIN_ONLY.some((p) => nextUrl.pathname.startsWith(p));
        if (isAdminRoute && role && !ADMIN_ROLES.includes(role)) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }

        if (nextUrl.pathname.startsWith("/dashboard/settings") && nextUrl.pathname !== "/dashboard/settings") {
          return true;
        }

        return true;
      }

      if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
};
