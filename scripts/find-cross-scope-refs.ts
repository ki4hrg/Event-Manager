// One-off audit for #213: links written before the ownership checks
// (assertEventRefs / partyRefs in src/lib/eventRefs.ts, and the vendor, file,
// room, user and workflow checks beside them) that point at another event's
// or another tenant's row. Every include on such a row still renders the
// foreign data.
//
//   npx tsx scripts/find-cross-scope-refs.ts          # report only (default)
//   npx tsx scripts/find-cross-scope-refs.ts --fix    # also repair
//
// In production, report first, from the app container:
//
//   docker compose exec app npx tsx scripts/find-cross-scope-refs.ts
//
// Read the report; --fix only after it reads right. It needs DATABASE_URL and
// nothing else. The report lists, per relation, how many rows point outside
// their scope and up to SAMPLE of them (owner id → foreign id).
//
// --fix runs every repair in one transaction (all or nothing) and prints what
// it changed: a nullable foreign key is set to NULL, a junction / link row is
// deleted. Relations marked "report" are left alone — the foreign id is
// required and the row is real work (a hotel proposal, a vendor quote, a
// form link or submission), so a person decides; they're listed at the end.
//
// Scope. A row's event and tenant come from its own eventId / tenantId, or
// through the parent it belongs to (SCOPES below: an EquipmentItem through
// its order or booth, a Room through its venue). A reference to an
// event-scoped row (function, presentation, breakout group, track, order,
// booth, RFP and their children) must stay in the owner's event; one to a
// tenant-owned row (vendor, contact, venue, room, equipment, storage,
// inventory, series, workflow template) in the owner's tenant.
//
// Covered relations (owner.column → target, check, repair):
//   Event-level
//     Function.breakoutGroupId → BreakoutGroup                        null
//     AVOrderFunction / SetupOrderFunction / PrintOrderFunction /
//       SupplyOrderFunction / MediaDeliverableFunction .functionId     delete
//     AVOrderPresentation / SetupOrderPresentation /
//       SupplyOrderPresentation / MediaDeliverablePresentation
//       .presentationId                                               delete
//     CateringOrder.functionId, CateringOrderServiceLocation.functionId,
//       TimelineItem.functionId (against its catering order),
//       EventSpecification.masterExhibitFunctionId,
//       EventSpecTransfer.functionId, EventSpecKey.functionId,
//       ExhibitBoothGroup.functionId, ExhibitBooth.functionId,
//       RfpSpaceRequest.functionId                                    null
//     PresentationSlot.presentationId                                 delete
//     Presentation.trackId, Presentation.breakoutGroupId,
//       PrintOrder.presentationId, ExhibitBooth.groupId               null
//     HotelProposal.rfpId / rfpBlockId, HotelProposalSpace.spaceRequestId,
//       HotelProposalConcession.concessionId, HotelPickupGuest.importId,
//       RfpSpaceRequest.cateringOrderId, RfpLineItem.{avOrderId,
//       cateringOrderId, printOrderId, equipmentItemId, printItemId,
//       cateringLineItemId}, VendorQuote.rfpId,
//       VendorQuoteLine.rfpLineItemId                                 null
//     FormLink.{functionId, presentationId, boothGroupId, parentId},
//       FormSubmission.formLinkId                                     report
//   Tenant-level
//     Event.seriesId, StorageLocation.parentId, Vendor.venueId,
//       AVOrder.copiedFromId, MediaDeliverable.copiedFromId           null
//     InventoryItem.equipmentId / locationId                          report
//     EventVenue.venueId, EventVendor.vendorId,
//       {AV,Catering,Setup,Print}OrderVendor.vendorId,
//       RfpRecipient.venueId / vendorId                               delete
//     VenueContact / VendorContact / EventKeyStaff / FunctionContact /
//       CateringOrderContact / PresentationContact /
//       MediaDeliverableContact .contactId                            delete
//     FunctionRoom / BreakoutGroupRoom / BreakoutSessionRoomOverride /
//       FunctionRoomNumber .roomId                                    delete
//     SetupOrder / PrintOrder / SupplyOrder / PresentationSlot .roomId null
//     provider / operator / designer / printer / advancer /
//       responsible-party vendor and contact columns on EquipmentItem,
//       InputGroup, InputItem, MonitorMix, MonitorOutput, SetupTable,
//       SetupOrderDetail, CateringOrderMenuSection, PresentationSlot,
//       Presentation, MediaDeliverable, PrintItem, SupplyOrder,
//       SupplyOrderItem                                               null
//     equipmentId on EquipmentItem, InputItem, MonitorMix,
//       MonitorOutput, SupplyOrderItem                                null
//     PrintItem.sourceLocationId, SupplyOrderItem.{sourceLocationId,
//       containerLocationId, inventoryItemId}                         null
//     EventSpecification.{securityVendorId, firstAidVendorId,
//       transportationVendorId, finalBillContactId},
//       EventSpecVip.contactId, ExhibitBooth.contactId,
//       HotelProposal.leadSourceVendorId / leadSourceContactId,
//       Rfp.contactId / decisionMakerId, FormLink.contactId,
//       FormLink.workflowTemplateId                                   null
//     HotelProposal.venueId, VendorQuote.vendorId,
//       SpeakerProfile.contactId, FormSubmission.requiredTemplateId   report
//     InboundEmail.eventId (event in another tenant)                  null
//     FormLink.eventId, FormSubmission.eventId (same)                 report
//   Finer
//     Room.groupId → a RoomGroup of the room's own venue              null
//     Contact.headshotFileId → one of the contact's own files         null
//     WorkflowStepCompletion.stepId / WorkflowChecklistCompletion.itemId
//       → a step / item of the instance's own template                delete
//     WorkflowInstance.(entityType, entityId) → an entity in the
//       template's tenant                                             delete
//     EventStaff.userId → a member of the event's tenant              delete
//
// Not checked (by design): structural parent columns (a row's own eventId /
// tenantId / parent id, which define its scope rather than point out of it),
// audit user columns (createdById, updatedById, handledById, importedById),
// global tables (users, roles, API keys, OAuth), and FileUpload's owner
// columns (the file sits under the row it was uploaded to). The script ends
// with a coverage audit over the Prisma schema: any foreign-key or *Id column
// that is neither checked nor in that list is printed, so a relation added
// after this script was written is not silently skipped.

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FIX = process.argv.includes("--fix");
const SAMPLE = 10;

// ─── Scopes ──────────────────────────────────────────────────────────────────

type Scope =
  | { tenant: string } // tenant-owned root: its tenantId column
  | { event: string; tenant?: string } // event-scoped: its eventId column (and own tenantId)
  | { parents: [fk: string, model: string][] } // the first parent that is set
  | "Event";

const SCOPES: Record<string, Scope> = {
  Event: "Event",
  // Tenant-owned roots
  CustomOption: { tenant: "tenantId" },
  Equipment: { tenant: "tenantId" },
  StorageLocation: { tenant: "tenantId" },
  InventoryItem: { tenant: "tenantId" },
  EventSeries: { tenant: "tenantId" },
  Venue: { tenant: "tenantId" },
  Contact: { tenant: "tenantId" },
  Vendor: { tenant: "tenantId" },
  WorkflowTemplate: { tenant: "tenantId" },
  // Event-scoped
  EventVenue: { event: "eventId" },
  EventKeyStaff: { event: "eventId" },
  EventStaff: { event: "eventId" },
  EventVendor: { event: "eventId" },
  Function: { event: "eventId" },
  AVOrder: { event: "eventId" },
  CateringOrder: { event: "eventId" },
  SetupOrder: { event: "eventId" },
  PrintOrder: { event: "eventId" },
  SupplyOrder: { event: "eventId" },
  MediaDeliverable: { event: "eventId" },
  PresentationTrack: { event: "eventId" },
  BreakoutGroup: { event: "eventId" },
  Presentation: { event: "eventId" },
  EventSpecification: { event: "eventId" },
  EventSpecVip: { event: "eventId" },
  EventSpecTransfer: { event: "eventId" },
  EventSpecKey: { event: "eventId" },
  ExhibitBoothGroup: { event: "eventId" },
  ExhibitBooth: { event: "eventId" },
  HotelProposal: { event: "eventId" },
  Rfp: { event: "eventId" },
  VendorQuote: { event: "eventId" },
  SpeakerProfile: { event: "eventId" },
  InboundEmail: { event: "eventId", tenant: "tenantId" },
  FormLink: { event: "eventId", tenant: "tenantId" },
  FormSubmission: { event: "eventId", tenant: "tenantId" },
  // Children, through their parent
  Room: { parents: [["venueId", "Venue"]] },
  RoomGroup: { parents: [["venueId", "Venue"]] },
  VenueContact: { parents: [["venueId", "Venue"]] },
  VendorContact: { parents: [["vendorId", "Vendor"]] },
  WorkflowStep: { parents: [["templateId", "WorkflowTemplate"]] },
  WorkflowChecklistItem: { parents: [["stepId", "WorkflowStep"]] },
  WorkflowInstance: { parents: [["templateId", "WorkflowTemplate"]] },
  WorkflowStepCompletion: { parents: [["instanceId", "WorkflowInstance"]] },
  WorkflowChecklistCompletion: { parents: [["instanceId", "WorkflowInstance"]] },
  FunctionRoom: { parents: [["functionId", "Function"]] },
  FunctionContact: { parents: [["functionId", "Function"]] },
  FunctionRoomNumber: { parents: [["functionId", "Function"]] },
  BreakoutSessionRoomOverride: { parents: [["functionId", "Function"]] },
  PresentationSlot: { parents: [["functionId", "Function"]] },
  BreakoutGroupRoom: { parents: [["breakoutGroupId", "BreakoutGroup"]] },
  PresentationContact: { parents: [["presentationId", "Presentation"]] },
  AVOrderFunction: { parents: [["avOrderId", "AVOrder"]] },
  AVOrderPresentation: { parents: [["avOrderId", "AVOrder"]] },
  AVOrderVendor: { parents: [["avOrderId", "AVOrder"]] },
  AudioSection: { parents: [["avOrderId", "AVOrder"]] },
  VideoSection: { parents: [["avOrderId", "AVOrder"]] },
  InputGroup: { parents: [["audioSectionId", "AudioSection"]] },
  InputItem: { parents: [["inputGroupId", "InputGroup"]] },
  MonitorMix: { parents: [["audioSectionId", "AudioSection"]] },
  MonitorOutput: { parents: [["monitorMixId", "MonitorMix"]] },
  CateringOrderVendor: { parents: [["cateringOrderId", "CateringOrder"]] },
  CateringOrderLineItem: { parents: [["cateringOrderId", "CateringOrder"]] },
  CateringOrderMenuSection: { parents: [["cateringOrderId", "CateringOrder"]] },
  CateringOrderServiceLocation: { parents: [["cateringOrderId", "CateringOrder"]] },
  CateringOrderContact: { parents: [["cateringOrderId", "CateringOrder"]] },
  TimelineItem: { parents: [["cateringOrderId", "CateringOrder"], ["functionId", "Function"]] },
  EquipmentItem: {
    parents: [
      ["avOrderId", "AVOrder"],
      ["videoSectionId", "VideoSection"],
      ["cateringOrderId", "CateringOrder"],
      ["setupOrderId", "SetupOrder"],
      ["exhibitBoothId", "ExhibitBooth"],
      ["exhibitBoothGroupId", "ExhibitBoothGroup"],
    ],
  },
  SetupOrderFunction: { parents: [["setupOrderId", "SetupOrder"]] },
  SetupOrderPresentation: { parents: [["setupOrderId", "SetupOrder"]] },
  SetupOrderVendor: { parents: [["setupOrderId", "SetupOrder"]] },
  SetupTable: { parents: [["setupOrderId", "SetupOrder"]] },
  SetupOrderDetail: { parents: [["setupOrderId", "SetupOrder"]] },
  PrintOrderFunction: { parents: [["printOrderId", "PrintOrder"]] },
  PrintOrderVendor: { parents: [["printOrderId", "PrintOrder"]] },
  PrintItem: { parents: [["printOrderId", "PrintOrder"]] },
  SupplyOrderFunction: { parents: [["supplyOrderId", "SupplyOrder"]] },
  SupplyOrderPresentation: { parents: [["supplyOrderId", "SupplyOrder"]] },
  SupplyOrderItem: { parents: [["supplyOrderId", "SupplyOrder"]] },
  MediaDeliverableFunction: { parents: [["mediaDeliverableId", "MediaDeliverable"]] },
  MediaDeliverablePresentation: { parents: [["mediaDeliverableId", "MediaDeliverable"]] },
  MediaDeliverableContact: { parents: [["mediaDeliverableId", "MediaDeliverable"]] },
  HotelProposalSpace: { parents: [["proposalId", "HotelProposal"]] },
  HotelProposalConcession: { parents: [["proposalId", "HotelProposal"]] },
  HotelBlock: { parents: [["proposalId", "HotelProposal"]] },
  HotelPickupGuest: { parents: [["blockId", "HotelBlock"]] },
  HotelPickupImport: { parents: [["blockId", "HotelBlock"]] },
  RfpSpaceRequest: { parents: [["rfpId", "Rfp"]] },
  RfpConcession: { parents: [["rfpId", "Rfp"]] },
  RfpRecipient: { parents: [["rfpId", "Rfp"]] },
  RfpHotelBlock: { parents: [["rfpId", "Rfp"]] },
  RfpLineItem: { parents: [["rfpId", "Rfp"]] },
  VendorQuoteLine: { parents: [["quoteId", "VendorQuote"]] },
  FileUpload: {
    parents: [
      ["eventId", "Event"],
      ["cateringOrderId", "CateringOrder"],
      ["avOrderId", "AVOrder"],
      ["setupOrderId", "SetupOrder"],
      ["printOrderId", "PrintOrder"],
      ["supplyOrderId", "SupplyOrder"],
      ["mediaDeliverableId", "MediaDeliverable"],
      ["hotelProposalId", "HotelProposal"],
      ["rfpId", "Rfp"],
      ["inboundEmailId", "InboundEmail"],
      ["vendorQuoteId", "VendorQuote"],
      ["formSubmissionId", "FormSubmission"],
      ["venueId", "Venue"],
      ["contactId", "Contact"],
    ],
  },
};

// Table and column names come from the schema (several catering tables keep
// their old BEO names); an unknown model or column throws before any query.
const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));

function table(model: string): string {
  const m = MODELS.get(model);
  if (!m) throw new Error(`Unknown model ${model}`);
  return `"${m.dbName ?? m.name}"`;
}

function col(model: string, field: string): string {
  const f = MODELS.get(model)?.fields.find((x) => x.name === field);
  if (!f || f.kind !== "scalar") throw new Error(`Unknown column ${model}.${field}`);
  return `"${f.dbName ?? f.name}"`;
}

let aliasN = 0;
const nextAlias = () => `s${aliasN++}`;

function scopeOf(model: string): Scope {
  const s = SCOPES[model];
  if (!s) throw new Error(`No scope for ${model}`);
  return s;
}

// SQL for the event id a row of `model` (aliased `a`) belongs to; null when
// the model sits above events (tenant-owned).
function eventOf(model: string, a: string): string | null {
  const s = scopeOf(model);
  if (s === "Event") return `${a}.${col("Event", "id")}`;
  if ("tenant" in s && !("event" in s)) return null;
  if ("event" in s) return `${a}.${col(model, s.event)}`;
  const parts = s.parents.flatMap(([fk, parent]) => {
    const b = nextAlias();
    const inner = eventOf(parent, b);
    return inner ? [`(SELECT ${inner} FROM ${table(parent)} ${b} WHERE ${b}.${col(parent, "id")} = ${a}.${col(model, fk)})`] : [];
  });
  return parts.length ? `COALESCE(${parts.join(", ")})` : null;
}

// SQL for the tenant id a row of `model` (aliased `a`) belongs to.
function tenantOf(model: string, a: string): string {
  const s = scopeOf(model);
  if (s === "Event") return `${a}.${col("Event", "tenantId")}`;
  if ("parents" in s) {
    const parts = s.parents.map(([fk, parent]) => {
      const b = nextAlias();
      return `(SELECT ${tenantOf(parent, b)} FROM ${table(parent)} ${b} WHERE ${b}.${col(parent, "id")} = ${a}.${col(model, fk)})`;
    });
    return parts.length === 1 ? parts[0] : `COALESCE(${parts.join(", ")})`;
  }
  if (s.tenant) return `${a}.${col(model, s.tenant)}`;
  if ("event" in s) {
    const e = nextAlias();
    return `(SELECT ${e}.${col("Event", "tenantId")} FROM ${table("Event")} ${e} WHERE ${e}.${col("Event", "id")} = ${a}.${col(model, s.event)})`;
  }
  throw new Error(`No tenant for ${model}`);
}

// ─── Checks ──────────────────────────────────────────────────────────────────

type Repair = "null" | "delete" | "report";

type Check = {
  owner: string;
  fk: string;
  target: string;
  level: "event" | "tenant" | "custom";
  repair: Repair;
  // level "custom": the owner's and target's keys that must match.
  ownerKey?: (x: string) => string;
  targetKey?: (y: string) => string;
  where?: (x: string) => string; // extra filter on the owner row
  label?: string;
};

const ev = (owner: string, fk: string, target: string, repair: Repair): Check => ({ owner, fk, target, level: "event", repair });
const tn = (owner: string, fk: string, target: string, repair: Repair): Check => ({ owner, fk, target, level: "tenant", repair });

// provider / operator vendor + contact columns, as partyRefs checks them.
const party = (owner: string, roles: string[], repair: Repair = "null"): Check[] =>
  roles.flatMap((r) => [tn(owner, `${r}VendorId`, "Vendor", repair), tn(owner, `${r}ContactId`, "Contact", repair)]);

const WORKFLOW_ENTITIES: Record<string, string> = {
  function: "Function",
  catering_order: "CateringOrder",
  av_order: "AVOrder",
  print_order: "PrintOrder",
  presentation: "Presentation",
  setup_order: "SetupOrder",
  supply_order: "SupplyOrder",
  media_deliverable: "MediaDeliverable",
  form_submission: "FormSubmission",
};

// The template of a completion row's instance.
const instanceTemplate = (owner: string) => (x: string) =>
  `(SELECT wi.${col("WorkflowInstance", "templateId")} FROM ${table("WorkflowInstance")} wi WHERE wi.${col("WorkflowInstance", "id")} = ${x}.${col(owner, "instanceId")})`;

const CHECKS: Check[] = [
  // Event-level: functions, presentations, groups, tracks, orders, RFP rows.
  ev("Function", "breakoutGroupId", "BreakoutGroup", "null"),
  ev("AVOrderFunction", "functionId", "Function", "delete"),
  ev("AVOrderPresentation", "presentationId", "Presentation", "delete"),
  ev("SetupOrderFunction", "functionId", "Function", "delete"),
  ev("SetupOrderPresentation", "presentationId", "Presentation", "delete"),
  ev("PrintOrderFunction", "functionId", "Function", "delete"),
  ev("SupplyOrderFunction", "functionId", "Function", "delete"),
  ev("SupplyOrderPresentation", "presentationId", "Presentation", "delete"),
  ev("MediaDeliverableFunction", "functionId", "Function", "delete"),
  ev("MediaDeliverablePresentation", "presentationId", "Presentation", "delete"),
  ev("CateringOrder", "functionId", "Function", "null"),
  ev("CateringOrderServiceLocation", "functionId", "Function", "null"),
  ev("TimelineItem", "functionId", "Function", "null"),
  ev("PresentationSlot", "presentationId", "Presentation", "delete"),
  ev("Presentation", "trackId", "PresentationTrack", "null"),
  ev("Presentation", "breakoutGroupId", "BreakoutGroup", "null"),
  ev("PrintOrder", "presentationId", "Presentation", "null"),
  ev("EventSpecification", "masterExhibitFunctionId", "Function", "null"),
  ev("EventSpecTransfer", "functionId", "Function", "null"),
  ev("EventSpecKey", "functionId", "Function", "null"),
  ev("ExhibitBoothGroup", "functionId", "Function", "null"),
  ev("ExhibitBooth", "functionId", "Function", "null"),
  ev("ExhibitBooth", "groupId", "ExhibitBoothGroup", "null"),
  ev("HotelProposal", "rfpId", "Rfp", "null"),
  ev("HotelProposal", "rfpBlockId", "RfpHotelBlock", "null"),
  ev("HotelProposalSpace", "spaceRequestId", "RfpSpaceRequest", "null"),
  ev("HotelProposalConcession", "concessionId", "RfpConcession", "null"),
  ev("HotelPickupGuest", "importId", "HotelPickupImport", "null"),
  ev("RfpSpaceRequest", "functionId", "Function", "null"),
  ev("RfpSpaceRequest", "cateringOrderId", "CateringOrder", "null"),
  ev("RfpLineItem", "avOrderId", "AVOrder", "null"),
  ev("RfpLineItem", "cateringOrderId", "CateringOrder", "null"),
  ev("RfpLineItem", "printOrderId", "PrintOrder", "null"),
  ev("RfpLineItem", "equipmentItemId", "EquipmentItem", "null"),
  ev("RfpLineItem", "printItemId", "PrintItem", "null"),
  ev("RfpLineItem", "cateringLineItemId", "CateringOrderLineItem", "null"),
  ev("VendorQuote", "rfpId", "Rfp", "null"),
  ev("VendorQuoteLine", "rfpLineItemId", "RfpLineItem", "null"),
  ev("FormLink", "functionId", "Function", "report"),
  ev("FormLink", "presentationId", "Presentation", "report"),
  ev("FormLink", "boothGroupId", "ExhibitBoothGroup", "report"),
  ev("FormLink", "parentId", "FormLink", "report"),
  ev("FormSubmission", "formLinkId", "FormLink", "report"),

  // Tenant-level: tenant-owned rows linked from anywhere.
  tn("Event", "seriesId", "EventSeries", "null"),
  tn("StorageLocation", "parentId", "StorageLocation", "null"),
  tn("InventoryItem", "equipmentId", "Equipment", "report"),
  tn("InventoryItem", "locationId", "StorageLocation", "report"),
  tn("Vendor", "venueId", "Venue", "null"),
  tn("AVOrder", "copiedFromId", "AVOrder", "null"),
  tn("MediaDeliverable", "copiedFromId", "MediaDeliverable", "null"),
  tn("EventVenue", "venueId", "Venue", "delete"),
  tn("EventVendor", "vendorId", "Vendor", "delete"),
  tn("AVOrderVendor", "vendorId", "Vendor", "delete"),
  tn("CateringOrderVendor", "vendorId", "Vendor", "delete"),
  tn("SetupOrderVendor", "vendorId", "Vendor", "delete"),
  tn("PrintOrderVendor", "vendorId", "Vendor", "delete"),
  tn("RfpRecipient", "venueId", "Venue", "delete"),
  tn("RfpRecipient", "vendorId", "Vendor", "delete"),
  tn("VenueContact", "contactId", "Contact", "delete"),
  tn("VendorContact", "contactId", "Contact", "delete"),
  tn("EventKeyStaff", "contactId", "Contact", "delete"),
  tn("FunctionContact", "contactId", "Contact", "delete"),
  tn("CateringOrderContact", "contactId", "Contact", "delete"),
  tn("PresentationContact", "contactId", "Contact", "delete"),
  tn("MediaDeliverableContact", "contactId", "Contact", "delete"),
  tn("FunctionRoom", "roomId", "Room", "delete"),
  tn("BreakoutGroupRoom", "roomId", "Room", "delete"),
  tn("BreakoutSessionRoomOverride", "roomId", "Room", "delete"),
  tn("FunctionRoomNumber", "roomId", "Room", "delete"),
  tn("SetupOrder", "roomId", "Room", "null"),
  tn("PrintOrder", "roomId", "Room", "null"),
  tn("SupplyOrder", "roomId", "Room", "null"),
  tn("PresentationSlot", "roomId", "Room", "null"),
  ...party("EquipmentItem", ["provider", "operator"]),
  ...party("InputGroup", ["provider", "operator"]),
  ...party("InputItem", ["provider", "operator"]),
  ...party("MonitorMix", ["provider", "operator"]),
  ...party("MonitorOutput", ["provider", "operator"]),
  ...party("PresentationSlot", ["advancer"]),
  ...party("Presentation", ["advancer"]),
  ...party("MediaDeliverable", ["provider"]),
  ...party("PrintItem", ["designer", "printer"]),
  ...party("SupplyOrder", ["provider"]),
  ...party("SupplyOrderItem", ["provider"]),
  tn("SetupTable", "providerVendorId", "Vendor", "null"),
  tn("SetupOrderDetail", "responsiblePartyVendorId", "Vendor", "null"),
  tn("CateringOrderMenuSection", "responsiblePartyVendorId", "Vendor", "null"),
  tn("EquipmentItem", "equipmentId", "Equipment", "null"),
  tn("InputItem", "equipmentId", "Equipment", "null"),
  tn("MonitorMix", "equipmentId", "Equipment", "null"),
  tn("MonitorOutput", "equipmentId", "Equipment", "null"),
  tn("SupplyOrderItem", "equipmentId", "Equipment", "null"),
  tn("PrintItem", "sourceLocationId", "StorageLocation", "null"),
  tn("SupplyOrderItem", "sourceLocationId", "StorageLocation", "null"),
  tn("SupplyOrderItem", "containerLocationId", "StorageLocation", "null"),
  tn("SupplyOrderItem", "inventoryItemId", "InventoryItem", "null"),
  tn("EventSpecification", "securityVendorId", "Vendor", "null"),
  tn("EventSpecification", "firstAidVendorId", "Vendor", "null"),
  tn("EventSpecification", "transportationVendorId", "Vendor", "null"),
  tn("EventSpecification", "finalBillContactId", "Contact", "null"),
  tn("EventSpecVip", "contactId", "Contact", "null"),
  tn("ExhibitBooth", "contactId", "Contact", "null"),
  tn("HotelProposal", "leadSourceVendorId", "Vendor", "null"),
  tn("HotelProposal", "leadSourceContactId", "Contact", "null"),
  tn("HotelProposal", "venueId", "Venue", "report"),
  tn("Rfp", "contactId", "Contact", "null"),
  tn("Rfp", "decisionMakerId", "Contact", "null"),
  tn("VendorQuote", "vendorId", "Vendor", "report"),
  tn("SpeakerProfile", "contactId", "Contact", "report"),
  tn("FormLink", "contactId", "Contact", "null"),
  tn("FormLink", "workflowTemplateId", "WorkflowTemplate", "null"),
  tn("FormSubmission", "requiredTemplateId", "WorkflowTemplate", "report"),
  // Rows carrying both a tenantId and an eventId: the event must be the tenant's.
  { owner: "InboundEmail", fk: "eventId", target: "Event", level: "custom", repair: "null", ownerKey: (x) => `${x}.${col("InboundEmail", "tenantId")}`, targetKey: (y) => `${y}.${col("Event", "tenantId")}` },
  { owner: "FormLink", fk: "eventId", target: "Event", level: "custom", repair: "report", ownerKey: (x) => `${x}.${col("FormLink", "tenantId")}`, targetKey: (y) => `${y}.${col("Event", "tenantId")}` },
  { owner: "FormSubmission", fk: "eventId", target: "Event", level: "custom", repair: "report", ownerKey: (x) => `${x}.${col("FormSubmission", "tenantId")}`, targetKey: (y) => `${y}.${col("Event", "tenantId")}` },

  // Finer than tenant.
  { owner: "Room", fk: "groupId", target: "RoomGroup", level: "custom", repair: "null", ownerKey: (x) => `${x}.${col("Room", "venueId")}`, targetKey: (y) => `${y}.${col("RoomGroup", "venueId")}`, label: "same venue" },
  { owner: "Contact", fk: "headshotFileId", target: "FileUpload", level: "custom", repair: "null", ownerKey: (x) => `${x}.${col("Contact", "id")}`, targetKey: (y) => `${y}.${col("FileUpload", "contactId")}`, label: "contact's own file" },
  {
    owner: "WorkflowStepCompletion",
    fk: "stepId",
    target: "WorkflowStep",
    level: "custom",
    repair: "delete",
    ownerKey: instanceTemplate("WorkflowStepCompletion"),
    targetKey: (y) => `${y}.${col("WorkflowStep", "templateId")}`,
    label: "instance's template",
  },
  {
    owner: "WorkflowChecklistCompletion",
    fk: "itemId",
    target: "WorkflowChecklistItem",
    level: "custom",
    repair: "delete",
    ownerKey: instanceTemplate("WorkflowChecklistCompletion"),
    targetKey: (y) =>
      `(SELECT ws.${col("WorkflowStep", "templateId")} FROM ${table("WorkflowStep")} ws WHERE ws.${col("WorkflowStep", "id")} = ${y}.${col("WorkflowChecklistItem", "stepId")})`,
    label: "instance's template",
  },
  ...Object.entries(WORKFLOW_ENTITIES).map(
    ([entityType, model]): Check => ({
      owner: "WorkflowInstance",
      fk: "entityId",
      target: model,
      level: "tenant",
      repair: "delete",
      where: (x) => `${x}.${col("WorkflowInstance", "entityType")} = '${entityType}'`,
      label: `entityType ${entityType}`,
    }),
  ),
];

function checkName(c: Check) {
  return `${c.owner}.${c.fk} → ${c.target}${c.label ? ` (${c.label})` : ""}`;
}

function checkSql(c: Check): string {
  const x = "x";
  const y = "y";
  let ownerKey: string | null;
  let targetKey: string | null;
  if (c.level === "custom") {
    ownerKey = c.ownerKey!(x);
    targetKey = c.targetKey!(y);
  } else if (c.level === "event") {
    ownerKey = eventOf(c.owner, x);
    targetKey = eventOf(c.target, y);
    if (!ownerKey || !targetKey) throw new Error(`${checkName(c)}: both sides must be event-scoped`);
  } else {
    ownerKey = tenantOf(c.owner, x);
    targetKey = tenantOf(c.target, y);
  }
  const extra = c.where ? ` AND ${c.where(x)}` : "";
  return `SELECT ${x}.${col(c.owner, "id")} AS "id", ${x}.${col(c.owner, c.fk)} AS "ref"
    FROM ${table(c.owner)} ${x} JOIN ${table(c.target)} ${y} ON ${y}.${col(c.target, "id")} = ${x}.${col(c.owner, c.fk)}
    WHERE (${ownerKey}) IS NOT NULL AND (${ownerKey}) IS DISTINCT FROM (${targetKey})${extra}`;
}

// A user on an event's staff must be a member of the event's tenant
// (addEventStaffCore); removing a member deletes their staff rows.
const STAFF_SQL = `SELECT x.${col("EventStaff", "id")} AS "id", x.${col("EventStaff", "userId")} AS "ref"
  FROM ${table("EventStaff")} x JOIN ${table("Event")} e ON e.${col("Event", "id")} = x.${col("EventStaff", "eventId")}
  WHERE NOT EXISTS (
    SELECT 1 FROM ${table("TenantMembership")} m
    WHERE m.${col("TenantMembership", "userId")} = x.${col("EventStaff", "userId")}
      AND m.${col("TenantMembership", "tenantId")} = e.${col("Event", "tenantId")}
  )`;

type Job = { name: string; sql: string; table: string; fk: string | null; repair: Repair };

const JOBS: Job[] = [
  ...CHECKS.map((c) => ({ name: checkName(c), sql: checkSql(c), table: c.owner, fk: c.fk, repair: c.repair })),
  { name: "EventStaff.userId → User (member of the event's tenant)", sql: STAFF_SQL, table: "EventStaff", fk: "userId", repair: "delete" },
];

// ─── Coverage audit ──────────────────────────────────────────────────────────

// Columns that define a row's own scope or are audit / global links.
const STRUCTURAL = new Set(
  Object.entries(SCOPES).flatMap(([model, s]) => {
    if (s === "Event") return [`${model}.tenantId`];
    if ("parents" in s) return s.parents.map(([fk]) => `${model}.${fk}`);
    return [s.tenant, "event" in s ? s.event : undefined].filter(Boolean).map((c) => `${model}.${c}`);
  }),
);
const AUDIT_COLUMNS = new Set(["createdById", "updatedById", "handledById", "importedById"]);
const GLOBAL_MODELS = new Set([
  "User",
  "Tenant",
  "TenantMembership",
  "ApiKey",
  "OAuthClient",
  "OAuthAuthorizationCode",
  "OAuthRefreshToken",
  "PasswordResetToken",
  "UserSetting",
  "Role",
  "RolePermission",
]);
// Scoped through a parent no check reads from, with no outward links.
const NO_OUTWARD_LINKS = new Set([
  "FunctionSchedule.functionId",
  "CateringOrderLineItem.cateringOrderId",
  "ShareLink.eventId",
  "ShareLinkGroup.eventId",
  "ShareLinkGroupItem.groupId",
  "EventStatusDefault.eventId",
  "EventSpecShuttleRoute.eventId",
  "EventSpecShipment.eventId",
  "EventSpecCoverage.eventId",
  "RetiredFunctionNumber.eventId",
  "EventPostEvent.eventId",
  "EventPostEventFutureDate.eventId",
  "EventPostEventDistribution.eventId",
  "HotelProposalMeal.proposalId",
  "HotelProposalNight.proposalId",
  "HotelProposalVersion.proposalId",
  "HotelProposalAmenity.proposalId",
  "HotelCharge.proposalId",
  "HotelCharge.blockId",
  "HotelBlockNight.blockId",
  "HotelPickupCount.blockId",
  "HotelPickupSnapshot.blockId",
  "RfpAlternateDate.rfpId",
  "RfpHotelBlockNight.blockId",
  // Not ids of rows: a tax exemption number.
  "ExhibitBoothGroup.taxExemptId",
  "ExhibitBooth.taxExemptId",
]);

function coverageGaps(): string[] {
  const checked = new Set(JOBS.map((j) => `${j.table}.${j.fk}`));
  const gaps: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    if (GLOBAL_MODELS.has(model.name)) continue;
    const fkColumns = new Set(model.fields.flatMap((f) => f.relationFromFields ?? []));
    for (const f of model.fields) {
      if (f.kind === "scalar" && /Id$/.test(f.name) && f.type === "String") fkColumns.add(f.name);
    }
    fkColumns.forEach((column) => {
      const key = `${model.name}.${column}`;
      if (!checked.has(key) && !STRUCTURAL.has(key) && !NO_OUTWARD_LINKS.has(key) && !AUDIT_COLUMNS.has(column)) gaps.push(key);
    });
  }
  return gaps;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

type Row = { id: string; ref: string };

async function find(db: Pick<PrismaClient, "$queryRawUnsafe">, job: Job): Promise<Row[]> {
  return db.$queryRawUnsafe<Row[]>(job.sql);
}

async function main() {
  console.log(FIX ? "Mode: --fix (one transaction)\n" : "Mode: report only (pass --fix to repair)\n");
  const found: { job: Job; rows: Row[] }[] = [];
  for (const job of JOBS) {
    const rows = await find(prisma, job);
    if (rows.length) found.push({ job, rows });
  }

  if (!found.length) console.log("No cross-scope references found.");
  for (const { job, rows } of found) {
    console.log(`${job.name}: ${rows.length} row(s) [${job.repair}]`);
    for (const r of rows.slice(0, SAMPLE)) console.log(`    ${job.table} ${r.id} → ${r.ref}`);
    if (rows.length > SAMPLE) console.log(`    … ${rows.length - SAMPLE} more`);
  }

  if (FIX && found.some((f) => f.job.repair !== "report")) {
    // Re-read inside the transaction so the repair matches what it sees.
    const changes = await prisma.$transaction(
      async (tx) => {
        const out: string[] = [];
        for (const { job } of found) {
          if (job.repair === "report") continue;
          const ids = (await find(tx, job)).map((r) => r.id);
          if (!ids.length) continue;
          const n =
            job.repair === "null"
              ? await tx.$executeRawUnsafe(`UPDATE ${table(job.table)} SET ${col(job.table, job.fk!)} = NULL WHERE ${col(job.table, "id")} = ANY($1::text[])`, ids)
              : await tx.$executeRawUnsafe(`DELETE FROM ${table(job.table)} WHERE ${col(job.table, "id")} = ANY($1::text[])`, ids);
          out.push(`${job.name}: ${job.repair === "null" ? "cleared" : "deleted"} ${n}`);
        }
        return out;
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );
    console.log("\nRepaired:");
    for (const line of changes) console.log(`  ${line}`);
  }

  const manual = found.filter((f) => f.job.repair === "report");
  if (manual.length) {
    console.log("\nLeft for a person (required link on a real record):");
    for (const { job, rows } of manual) console.log(`  ${job.name}: ${rows.length}`);
  }

  const gaps = coverageGaps();
  if (gaps.length) {
    console.log("\nColumns this script does not check (add them to CHECKS or the skip lists):");
    for (const g of gaps) console.log(`  ${g}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
