import { describe, expect, it } from "vitest";
import { rawReadProblems } from "./env";
import { envValue } from "./envValue";

describe("env (#275): the startup check and the app read values the same way", () => {
  it("refuses a quoted or padded NEXTAUTH_URL or DATABASE_URL, which libraries read as written", () => {
    expect(rawReadProblems({ NEXTAUTH_URL: '"https://events.example.com"' })).toEqual([expect.stringContaining("NEXTAUTH_URL")]);
    expect(rawReadProblems({ DATABASE_URL: " postgres://db/em " })).toEqual([expect.stringContaining("DATABASE_URL")]);
    expect(rawReadProblems({ NEXTAUTH_URL: "   " })).toEqual([expect.stringContaining("NEXTAUTH_URL")]);
  });

  it("accepts clean and absent values, and leaves the app's own readers to envValue", () => {
    expect(rawReadProblems({ NEXTAUTH_URL: "https://events.example.com", DATABASE_URL: "postgres://db/em" })).toEqual([]);
    expect(rawReadProblems({ UPLOAD_DIR: "'/data/uploads'", MAILGUN_DOMAIN: '"mg.example.com"' })).toEqual([]);
  });

  it("envValue trims, drops one pair of quotes, and reads blank as absent", () => {
    expect(envValue(' "/data/uploads" ')).toBe("/data/uploads");
    expect(envValue("'x'")).toBe("x");
    expect(envValue("   ")).toBeUndefined();
    expect(envValue('""')).toBeUndefined();
    expect(envValue(undefined)).toBeUndefined();
  });
});
