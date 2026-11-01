import { describe, expect, it } from "vitest";
import { rawReadProblems } from "./env";

describe("env: variables the app reads as written (#275)", () => {
  it("refuses a quoted or padded NEXTAUTH_URL, DATABASE_URL or UPLOAD_DIR", () => {
    expect(rawReadProblems({ NEXTAUTH_URL: '"https://events.example.com"' })).toEqual([expect.stringContaining("NEXTAUTH_URL")]);
    expect(rawReadProblems({ DATABASE_URL: " postgres://db/em " })).toEqual([expect.stringContaining("DATABASE_URL")]);
    expect(rawReadProblems({ UPLOAD_DIR: "'/data/uploads'" })).toEqual([expect.stringContaining("UPLOAD_DIR")]);
  });

  it("accepts clean, blank and absent values, and leaves other variables to the normalizing check", () => {
    expect(rawReadProblems({ NEXTAUTH_URL: "https://events.example.com", DATABASE_URL: "postgres://db/em", UPLOAD_DIR: "" })).toEqual([]);
    expect(rawReadProblems({ MAILGUN_DOMAIN: '"mg.example.com"' })).toEqual([]);
  });
});
