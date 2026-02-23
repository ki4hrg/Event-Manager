import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLoginPage = req.nextUrl.pathname === "/login";
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

  // Allow auth routes
  if (isAuthRoute) {
    return;
  }

  // Redirect to home if logged in and trying to access login
  if (isLoggedIn && isOnLoginPage) {
    return Response.redirect(new URL("/", req.nextUrl));
  }

  // Redirect to login if not logged in and trying to access protected route
  if (!isLoggedIn && !isOnLoginPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
