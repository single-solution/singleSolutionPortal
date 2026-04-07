import type { NextAuthConfig } from "next-auth";

const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password", "/setup-password", "/preview"];
const ADMIN_ONLY = ["/organization", "/workspace"];
const ADMIN_ROLES = ["superadmin", "manager", "teamLead"];
const SUPERADMIN_ONLY = ["/designations"];

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
    jwt({ token, user }) {
      if (user) {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const u = user as any;
        token.id = u.id;
        token.role = u.role;
        token.firstName = u.firstName;
        token.lastName = u.lastName;
        token.username = u.username;
        token.profileImage = u.profileImage;
        token.showCoordinates = u.showCoordinates ?? false;
      }
      return token;
    },
    session({ session, token }) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const u = session.user as any;
      u.id = token.id as string;
      u.role = token.role as string;
      u.firstName = token.firstName as string;
      u.lastName = token.lastName as string;
      u.username = token.username as string;
      u.profileImage = token.profileImage as string | undefined;
      u.showCoordinates = token.showCoordinates as boolean | undefined;
      return session;
    },
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

      // Legacy route redirects
      if (pathname.startsWith("/employees/") && !pathname.startsWith("/employees/EmployeeForm")) {
        const rest = pathname.slice("/employees".length);
        return Response.redirect(new URL(`/employee${rest}`, nextUrl));
      }
      if (pathname === "/employees") return Response.redirect(new URL("/organization", nextUrl));
      if (pathname.startsWith("/departments")) return Response.redirect(new URL("/organization", nextUrl));
      if (pathname === "/teams" || pathname.startsWith("/teams/")) return Response.redirect(new URL("/organization", nextUrl));
      if (pathname === "/campaigns") return Response.redirect(new URL("/workspace/campaigns", nextUrl));
      if (pathname === "/tasks") return Response.redirect(new URL("/workspace/tasks", nextUrl));
      if (pathname === "/attendance") return Response.redirect(new URL("/insights-desk/attendance", nextUrl));

      const role = (auth?.user as Record<string, unknown>)?.role as string | undefined;

      if (SUPERADMIN_ONLY.some((p) => pathname.startsWith(p)) && role !== "superadmin") {
        return Response.redirect(new URL("/", nextUrl));
      }

      const isAdminRoute = ADMIN_ONLY.some((p) => pathname.startsWith(p));
      if (isAdminRoute && role && !ADMIN_ROLES.includes(role)) {
        return Response.redirect(new URL("/", nextUrl));
      }

      return true;
    },
  },
};
