import { describe, expect, it } from "vitest";
import { PermissionLevel, PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError } from "@/lib/permissions";
import { makeMember, makeTenant, makeUser } from "../../../test/fixtures";
import { createContactCore, updateContactCore } from "./core";

const { CONTACTS } = PermissionResource;
const { VIEW, WRITE } = PermissionLevel;

const args = (firstName: string) => ({
  firstName,
  lastName: "Tester",
  email: null,
  phone: null,
  organization: null,
  notes: null,
  roles: [],
});

describe("contacts core: tenant and permission boundaries", () => {
  it("lets a member with CONTACTS WRITE create and update in their own tenant", async () => {
    const tenant = await makeTenant();
    const user = await makeMember(tenant.id, { [CONTACTS]: WRITE });
    const contact = await createContactCore(args("Ada"), user.id, tenant.id);
    const updated = await updateContactCore(contact.id, args("Ada L."), user.id, tenant.id);
    expect(updated.firstName).toBe("Ada L.");
    expect(updated.tenantId).toBe(tenant.id);
  });

  it("refuses a user who isn't a member of the tenant", async () => {
    const tenant = await makeTenant();
    const stranger = await makeUser();
    await expect(createContactCore(args("Eve"), stranger.id, tenant.id)).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses a member whose role only grants VIEW", async () => {
    const tenant = await makeTenant();
    const viewer = await makeMember(tenant.id, { [CONTACTS]: VIEW });
    await expect(createContactCore(args("Vic"), viewer.id, tenant.id)).rejects.toBeInstanceOf(PermissionError);
  });

  it("treats another tenant's contact id as not found, and leaves it unchanged", async () => {
    const [mine, theirs] = await Promise.all([makeTenant("Mine"), makeTenant("Theirs")]);
    const [me, them] = await Promise.all([
      makeMember(mine.id, { [CONTACTS]: WRITE }),
      makeMember(theirs.id, { [CONTACTS]: WRITE }),
    ]);
    const foreign = await createContactCore(args("Theirs"), them.id, theirs.id);

    await expect(updateContactCore(foreign.id, args("Hijacked"), me.id, mine.id)).rejects.toMatchObject({
      code: "P2025",
    });
    const after = await prisma.contact.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(after.firstName).toBe("Theirs");
  });
});
