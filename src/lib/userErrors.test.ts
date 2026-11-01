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

  it("shows the fallback for anything that came back from the server, or from the network", () => {
    const fromServer = Object.assign(new Error("A user with this email already exists"), { digest: "123" });
    expect(actionErrorMessage(fromServer, "An error occurred")).toBe("An error occurred");
    expect(actionErrorMessage(new TypeError("Failed to fetch"), "Couldn't save")).toBe("Couldn't save");
    expect(actionErrorMessage(new TypeError("Load failed"), "Couldn't save")).toBe("Couldn't save");
    expect(actionErrorMessage(new TypeError("NetworkError when attempting to fetch resource."), "Couldn't save")).toBe("Couldn't save");
    expect(actionErrorMessage(new Error('Server Action "abc" was not found on the server.'), "Couldn't save")).toBe("Couldn't save");
  });

  it("shows a message thrown in the browser as is", () => {
    expect(actionErrorMessage(new Error("Row 3 has no header"), "Import failed")).toBe("Row 3 has no header");
  });

  it("is not how refusals reach the person: withUserErrors returns them as { error }", async () => {
    await expect(withUserErrors(async () => { throw new UserFacingError("Pick a contact"); })).resolves.toEqual({ error: "Pick a contact" });
  });
});
