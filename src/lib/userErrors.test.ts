import { describe, expect, it } from "vitest";
import { actionErrorMessage, UserFacingError, withUserErrors } from "./userErrors";

describe("actionErrorMessage (#252)", () => {
  it("shows the caller's sentence for React's production placeholders, never the placeholder", () => {
    for (const message of [
      "Minified React error #441; visit https://react.dev/errors/441 for the full message",
      "An error occurred in the Server Components render. The specific message is omitted in production builds",
    ]) {
      expect(actionErrorMessage(new Error(message), "Couldn't save")).toBe("Couldn't save");
    }
    expect(actionErrorMessage("boom", "Couldn't save")).toBe("Couldn't save");
    expect(actionErrorMessage(new Error(""), "Couldn't save")).toBe("Couldn't save");
  });

  it("shows a real message (thrown in the browser, or in development) as is", () => {
    expect(actionErrorMessage(new Error("Row 3 has no header"), "Import failed")).toBe("Row 3 has no header");
  });

  it("leaves refusals to withUserErrors, which returns them as { error }", async () => {
    await expect(withUserErrors(async () => { throw new UserFacingError("Pick a contact"); })).resolves.toEqual({ error: "Pick a contact" });
  });
});
