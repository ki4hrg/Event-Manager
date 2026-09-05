// Per-tenant seed data. Every Tenant gets its own copy of the dropdown options,
// the equipment catalog, and the "Event Team" system vendor, so this runs both
// from prisma/seed.mjs (for every existing tenant) and from the app when a super
// admin creates a tenant (src/app/tenants/core.ts). Plain ESM with no imports so
// both runtimes can load it; `db` is a PrismaClient or a transaction client.

export const DEFAULT_OPTIONS = {
  function_type: [
    { label: "General", color: "gray", sortOrder: 0 },
    { label: "Meal / Catering Order", color: "orange", sortOrder: 1 },
    { label: "Breakout Session", color: "blue", sortOrder: 2 },
    { label: "Plenary Session", color: "purple", sortOrder: 3 },
  ],
  contact_role: [
    { label: "Speaker", sortOrder: 0 },
    { label: "Venue Contact", sortOrder: 1 },
    { label: "Vendor", sortOrder: 2 },
    { label: "Staff", sortOrder: 3 },
    { label: "Other", sortOrder: 4 },
  ],
  av_equipment: [
    { label: "Projector", sortOrder: 0 },
    { label: "Screen", sortOrder: 1 },
    { label: "Microphone", sortOrder: 2 },
    { label: "Podium", sortOrder: 3 },
    { label: "Webcast", sortOrder: 4 },
    { label: "Recording", sortOrder: 5 },
    { label: "Video Playback", sortOrder: 6 },
  ],
  schedule_type: [
    { label: "Setup", color: "yellow", sortOrder: 0 },
    { label: "Rehearsal", color: "blue", sortOrder: 1 },
    { label: "Main Event", color: "green", sortOrder: 2 },
    { label: "Breakdown", color: "orange", sortOrder: 3 },
  ],
  presenter_role: [
    { label: "Presenter", sortOrder: 0 },
    { label: "Co-Presenter", sortOrder: 1 },
    { label: "Moderator", sortOrder: 2 },
    { label: "Panelist", sortOrder: 3 },
  ],
  presentation_type: [
    { label: "Breakout", color: "blue", sortOrder: 0 },
    { label: "Plenary", color: "purple", sortOrder: 1 },
  ],
  equipment_category: [
    { label: "Tables", isSystem: true, sortOrder: 0, models: ["SETUP_ORDER"] },
    { label: "Chairs", isSystem: true, sortOrder: 1, models: ["SETUP_ORDER"] },
    { label: "Staging", sortOrder: 2 },
    { label: "Signage", sortOrder: 3 },
    { label: "Audio Inputs", isSystem: true, sortOrder: 4, models: ["AV_ORDER"] },
    { label: "Audio Outputs", isSystem: true, sortOrder: 5, models: ["AV_ORDER"] },
    { label: "Video Inputs", isSystem: true, sortOrder: 6, models: ["AV_ORDER"] },
    { label: "Video Outputs", isSystem: true, sortOrder: 7, models: ["AV_ORDER"] },
  ],
  substatus: [
    { label: "Expected", group: "PENDING", sortOrder: 0 },
    { label: "Requested", group: "PENDING", sortOrder: 1 },
    { label: "Approved", group: "IN_PROGRESS", sortOrder: 0 },
    { label: "Confirmed", group: "COMPLETE", sortOrder: 0 },
    { label: "Denied", group: "CANCELLED", sortOrder: 0 },
    { label: "Cancelled", group: "CANCELLED", sortOrder: 1 },
  ],
  delivery_method: [
    { label: "Pre-loaded", sortOrder: 0 },
    { label: "Brought Day Of", sortOrder: 1 },
  ],
  media_type: [
    { label: "Video", sortOrder: 0 },
    { label: "Presentation", sortOrder: 1 },
  ],
  // Display taxonomy for StorageLocation.type. The PLACE/CONTAINER split is the
  // hard-coded LocationKind enum; these labels are free for admins to extend.
  location_type: [
    { label: "Building", sortOrder: 0 },
    { label: "Room", sortOrder: 1 },
    { label: "Shelf", sortOrder: 2 },
    { label: "Rack", sortOrder: 3 },
    { label: "Pallet", sortOrder: 4 },
    { label: "Case", sortOrder: 5 },
    { label: "Box", sortOrder: 6 },
    { label: "Tote", sortOrder: 7 },
    { label: "Trailer", sortOrder: 8 },
  ],
  file_type: [
    { label: "Proposal", sortOrder: 0 },
    { label: "Invoice", sortOrder: 1 },
    { label: "Contract", sortOrder: 2 },
    { label: "Floor Plan", sortOrder: 3 },
    { label: "Diagram", sortOrder: 4 },
    { label: "Menu", sortOrder: 5 },
    { label: "Spec Sheet", sortOrder: 6 },
    { label: "Other", sortOrder: 7 },
  ],
  print_distribution: [
    { label: "Staged in Room", sortOrder: 0 },
    { label: "On Tables", sortOrder: 1 },
    { label: "At Door / Entrance", sortOrder: 2 },
    { label: "At Registration", sortOrder: 3 },
    { label: "Mailed in Advance", sortOrder: 4 },
  ],
  setup_type: [
    { label: "Fixed in Room", sortOrder: 0 },
    { label: "Theater", sortOrder: 1 },
    { label: "Classroom", sortOrder: 2 },
    { label: "Banquet Rounds", sortOrder: 3 },
    { label: "U-Shape", sortOrder: 4 },
    { label: "Hollow Square", sortOrder: 5 },
    { label: "Reception / Standing", sortOrder: 6 },
  ],
};

export const DEFAULT_EQUIPMENT = [
  // Tables
  { name: "6' Rectangle", category: "Tables", sortOrder: 0 },
  { name: "8' Rectangle", category: "Tables", sortOrder: 1 },
  { name: "60\" Round", category: "Tables", sortOrder: 2 },
  { name: "72\" Round", category: "Tables", sortOrder: 3 },
  { name: "Half Round", category: "Tables", sortOrder: 4 },
  { name: "Cocktail / Highboy", category: "Tables", sortOrder: 5 },
  { name: "Head Table", category: "Tables", sortOrder: 6 },
  // Chairs
  { name: "Banquet Chair", category: "Chairs", sortOrder: 0 },
  { name: "Folding Chair", category: "Chairs", sortOrder: 1 },
  { name: "Theater Seat (fixed)", category: "Chairs", sortOrder: 2 },
  // Audio Inputs
  { name: "Handheld Mic", category: "Audio Inputs", sortOrder: 0 },
  { name: "Lapel / Lavalier Mic", category: "Audio Inputs", sortOrder: 1 },
  { name: "Headset Mic", category: "Audio Inputs", sortOrder: 2 },
  { name: "Podium Mic", category: "Audio Inputs", sortOrder: 3 },
  { name: "Direct Input (DI)", category: "Audio Inputs", sortOrder: 4 },
  { name: "Handheld + Belt Pack", category: "Audio Inputs", sortOrder: 5 },
  // Audio Outputs
  { name: "Stage Monitor / Wedge", category: "Audio Outputs", sortOrder: 0 },
  { name: "In-Ear Monitor (IEM)", category: "Audio Outputs", sortOrder: 1 },
  { name: "PA Speaker", category: "Audio Outputs", sortOrder: 2 },
  { name: "Subwoofer", category: "Audio Outputs", sortOrder: 3 },
  { name: "Hearing Loop", category: "Audio Outputs", sortOrder: 4 },
  // Video Inputs
  { name: "Camera", category: "Video Inputs", sortOrder: 0 },
  { name: "PTZ Camera", category: "Video Inputs", sortOrder: 1 },
  { name: "Laptop / Presenter Input", category: "Video Inputs", sortOrder: 2 },
  { name: "Video Switcher", category: "Video Inputs", sortOrder: 3 },
  { name: "Wireless Presentation System", category: "Video Inputs", sortOrder: 4 },
  // Video Outputs
  { name: "Projector", category: "Video Outputs", sortOrder: 0 },
  { name: "LED Screen / Wall", category: "Video Outputs", sortOrder: 1 },
  { name: "Flat Screen / TV", category: "Video Outputs", sortOrder: 2 },
  { name: "Projection Screen", category: "Video Outputs", sortOrder: 3 },
  { name: "Recording Deck / Encoder", category: "Video Outputs", sortOrder: 4 },
];

export const SYSTEM_VENDOR_NAME = "Event Team";

/**
 * Idempotently seeds one tenant's defaults. A category (or the equipment for a
 * category, or the system vendor) is only written when the tenant has none, so
 * re-running never clobbers admin edits.
 *
 * @param {{ customOption: any; equipment: any; vendor: any }} db PrismaClient or transaction client
 * @param {string} tenantId
 * @returns {Promise<{ options: number; equipment: number; systemVendor: boolean }>}
 */
export async function seedTenantDefaults(db, tenantId) {
  let options = 0;
  for (const [category, rows] of Object.entries(DEFAULT_OPTIONS)) {
    const existing = await db.customOption.count({ where: { tenantId, category } });
    if (existing > 0) continue;
    await db.customOption.createMany({
      data: rows.map((o) => ({ tenantId, category, ...o })),
    });
    options += rows.length;
  }

  let equipment = 0;
  const categories = [...new Set(DEFAULT_EQUIPMENT.map((e) => e.category))];
  for (const category of categories) {
    const existing = await db.equipment.count({ where: { tenantId, category } });
    if (existing > 0) continue;
    const rows = DEFAULT_EQUIPMENT.filter((e) => e.category === category);
    await db.equipment.createMany({ data: rows.map((e) => ({ tenantId, ...e })) });
    equipment += rows.length;
  }

  let systemVendor = false;
  const vendor = await db.vendor.findFirst({ where: { tenantId, isSystemVendor: true } });
  if (!vendor) {
    await db.vendor.create({ data: { tenantId, name: SYSTEM_VENDOR_NAME, isSystemVendor: true } });
    systemVendor = true;
  }

  return { options, equipment, systemVendor };
}
