// Prisma include for the functions the ESG renders (Part II rows and Part IIIa
// set-up orders). Vendors carry isSystemVendor / venueId so "provided by" can
// be derived (src/lib/esg/providedBy.ts).

import type { Prisma } from "@prisma/client";

const vendor = { select: { id: true, name: true, isSystemVendor: true, venueId: true } } as const;
const party = {
  providerVendor: { select: { name: true } },
  providerContact: { select: { firstName: true, lastName: true } },
  operatorVendor: { select: { name: true } },
  operatorContact: { select: { firstName: true, lastName: true } },
} as const;
const equipmentItems = {
  include: { equipment: { select: { name: true, category: true } }, ...party },
  orderBy: { sortOrder: "asc" },
} as const;
const room = { select: { id: true, name: true, venue: { select: { name: true } } } } as const;

export const esgFunctionInclude = {
  breakoutGroup: { select: { name: true, rooms: { select: { roomId: true, room } } } },
  sessionRoomOverrides: { select: { roomId: true, type: true, room } },
  roomNumbers: { select: { roomId: true, suffix: true } },
  rooms: { select: { roomId: true, room } },
  schedules: { orderBy: { startTime: "asc" } },
  contacts: {
    include: { contact: { select: { firstName: true, lastName: true, phone: true, organization: true } } },
    orderBy: { id: "asc" },
  },
  cateringOrder: {
    include: {
      vendors: { include: { vendor } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      menuSections: { orderBy: { sortOrder: "asc" } },
    },
  },
  avOrderFunctions: {
    include: {
      avOrder: {
        include: {
          vendors: { include: { vendor } },
          audioSection: {
            include: {
              inputGroups: {
                include: { inputItems: { include: { equipment: { select: { name: true } }, ...party }, orderBy: { sortOrder: "asc" } } },
                orderBy: { sortOrder: "asc" },
              },
              monitorMixes: {
                include: {
                  equipment: { select: { name: true } },
                  ...party,
                  monitorOutputs: { include: { equipment: { select: { name: true } }, ...party }, orderBy: { sortOrder: "asc" } },
                },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
          videoSection: { include: { equipmentItems } },
          equipmentItems,
        },
      },
    },
  },
  setupOrderFunctions: {
    include: {
      setupOrder: {
        include: {
          room: { select: { id: true, name: true } },
          vendors: { include: { vendor } },
          tables: { include: { providerVendor: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
          details: { orderBy: { sortOrder: "asc" } },
          equipmentItems,
          files: { select: { id: true, fileType: true } },
        },
      },
    },
  },
  printOrderFunctions: {
    include: {
      printOrder: {
        include: {
          vendors: { include: { vendor } },
          room: { select: { name: true } },
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  },
  presentationSlots: {
    include: {
      room: { select: { id: true, name: true } },
      presentation: {
        select: {
          title: true,
          speakers: {
            include: { contact: { select: { firstName: true, lastName: true, organization: true } } },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
  },
  specTransfers: { orderBy: { sortOrder: "asc" } },
  specKeys: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.FunctionInclude;

export type EsgFunctionRow = Prisma.FunctionGetPayload<{ include: typeof esgFunctionInclude }>;

const esgBoothFunction = {
  select: { id: true, name: true, functionNumber: true, schedules: { select: { type: true, startTime: true, endTime: true, isPublic: true } } },
} as const;

export const esgBoothInclude = {
  contact: { select: { firstName: true, lastName: true, phone: true, email: true } },
  function: esgBoothFunction,
  group: { include: { function: esgBoothFunction, equipmentItems } },
  equipmentItems,
} satisfies Prisma.ExhibitBoothInclude;

export type EsgBoothRow = Prisma.ExhibitBoothGetPayload<{ include: typeof esgBoothInclude }>;
