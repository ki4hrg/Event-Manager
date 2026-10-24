// Per-tenant seed data. Every Tenant gets its own copy of the dropdown options,
// the equipment catalog, and the "Event Team" system vendor, so this runs both
// from prisma/seed.mjs (for every existing tenant) and from the app when a super
// admin creates a tenant (src/app/(admin)/tenants/core.ts). Plain ESM with no imports so
// both runtimes can load it; `db` is a PrismaClient or a transaction client.

export const DEFAULT_OPTIONS = {
  // APEX ESG Part IIIa function types, plus the meal type the catering flow
  // uses. Admins edit freely; nothing keys off these labels. group is the ESG
  // §I function-space line (FUNCTION_SPACES in src/lib/esg/apex.ts).
  function_type: [
    { label: "General Session", color: "purple", sortOrder: 0 },
    { label: "Break Out", color: "blue", sortOrder: 1 },
    { label: "Workshop", color: "blue", sortOrder: 2 },
    { label: "Meeting", color: "gray", sortOrder: 3 },
    { label: "Meal / Catering Order", color: "orange", sortOrder: 4 },
    { label: "Exhibit", color: "green", sortOrder: 5 },
    { label: "Poster Session", color: "green", sortOrder: 6 },
    { label: "Registration", color: "yellow", group: "REGISTRATION", sortOrder: 7 },
    { label: "Speaker Room", color: "gray", group: "SPEAKER_READY", sortOrder: 8 },
    { label: "Dressing/Green Room", color: "gray", sortOrder: 9 },
    { label: "Office", color: "gray", group: "OFFICE", sortOrder: 10 },
    { label: "Photo Room", color: "gray", sortOrder: 11 },
    { label: "Coat Check", color: "gray", sortOrder: 12 },
    { label: "Storage", color: "gray", group: "STORAGE", sortOrder: 13 },
    { label: "Other", color: "gray", sortOrder: 14 },
  ],
  contact_role: [
    { label: "Speaker", sortOrder: 0 },
    { label: "Venue Contact", sortOrder: 1 },
    { label: "Vendor", sortOrder: 2 },
    { label: "Staff", sortOrder: 3 },
    { label: "Other", sortOrder: 4 },
  ],
  // group marks the ESG "Set Up By" (SETUP) and "Dismantle No Later Than"
  // (TEARDOWN) schedules, and MAIN the schedule a function is dated by and new
  // schedules default to, so renaming a label doesn't break the derivation.
  schedule_type: [
    { label: "Setup", color: "yellow", group: "SETUP", sortOrder: 0 },
    { label: "Rehearsal", color: "blue", sortOrder: 1 },
    { label: "Main Event", color: "green", group: "MAIN", sortOrder: 2 },
    { label: "Breakdown", color: "orange", group: "TEARDOWN", sortOrder: 3 },
  ],
  // Contacts on functions, catering orders and media deliverables.
  assignment_role: [
    { label: "Point of contact", sortOrder: 0 },
    { label: "Host", sortOrder: 1 },
    { label: "Presenter", sortOrder: 2 },
    { label: "Moderator", sortOrder: 3 },
    { label: "Panelist", sortOrder: 4 },
  ],
  staff_title: [
    { label: "Event Lead", sortOrder: 0 },
    { label: "Logistics Lead", sortOrder: 1 },
    { label: "Registration Lead", sortOrder: 2 },
    { label: "Communications Lead", sortOrder: 3 },
    { label: "Sponsorship Lead", sortOrder: 4 },
  ],
  venue_contact_type: [
    { label: "Sales", sortOrder: 0 },
    { label: "Event Services", sortOrder: 1 },
    { label: "Catering", sortOrder: 2 },
    { label: "AV", sortOrder: 3 },
    { label: "Billing", sortOrder: 4 },
    { label: "On-site", sortOrder: 5 },
  ],
  vendor_contact_type: [
    { label: "Sales", sortOrder: 0 },
    { label: "Billing", sortOrder: 1 },
    { label: "Technical", sortOrder: 2 },
    { label: "On-site", sortOrder: 3 },
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
    // group: the type issued RFPs are filed under (src/lib/fileTypes.ts).
    { label: "RFP", group: "RFP", sortOrder: 8 },
  ],
  print_distribution: [
    { label: "Staged in Room", sortOrder: 0 },
    { label: "On Tables", sortOrder: 1 },
    { label: "At Door / Entrance", sortOrder: 2 },
    { label: "At Registration", sortOrder: 3 },
    { label: "Mailed in Advance", sortOrder: 4 },
  ],
  // APEX ESG Part IIIa "Primary Room Set-up" list.
  setup_type: [
    { label: "Theater", sortOrder: 0 },
    { label: "Theater - Semi-circle", sortOrder: 1 },
    { label: "Theater - Chevron", sortOrder: 2 },
    { label: "Classroom - 2 per 6 ft. tables", sortOrder: 3 },
    { label: "Classroom - 3 per 6 ft. tables", sortOrder: 4 },
    { label: "Classroom - 3 per 8 ft. tables", sortOrder: 5 },
    { label: "Classroom - 4 per 8 ft. tables", sortOrder: 6 },
    { label: "Classroom (Chevron) - 2 per 6 ft. tables", sortOrder: 7 },
    { label: "Classroom (Chevron) - 3 per 6 ft. tables", sortOrder: 8 },
    { label: "Classroom (Chevron) - 3 per 8 ft. tables", sortOrder: 9 },
    { label: "Classroom (Chevron) - 4 per 8 ft. tables", sortOrder: 10 },
    { label: "Banquet Rounds for 8", sortOrder: 11 },
    { label: "Banquet Rounds for 10", sortOrder: 12 },
    { label: "Banquet Rounds for 12", sortOrder: 13 },
    { label: "Crescent Rounds", sortOrder: 14 },
    { label: "Crescent Rounds of 5", sortOrder: 15 },
    { label: "Crescent Rounds of 6", sortOrder: 16 },
    { label: "Cocktail Rounds", sortOrder: 17 },
    { label: "Board Room (Conference)", sortOrder: 18 },
    { label: "Royal conference", sortOrder: 19 },
    { label: "Hollow Square", sortOrder: 20 },
    { label: "U-shaped", sortOrder: 21 },
    { label: "T-shaped", sortOrder: 22 },
    { label: "E-shaped", sortOrder: 23 },
    { label: "Talk Show", sortOrder: 24 },
    { label: "Perimeter Seating", sortOrder: 25 },
    { label: "Flow (no tables or chairs)", sortOrder: 26 },
    { label: "Registration", sortOrder: 27 },
    { label: "Existing", sortOrder: 28 },
    { label: "10x10 exhibits", sortOrder: 29 },
    { label: "8x10 exhibits", sortOrder: 30 },
    { label: "Island Exhibit", sortOrder: 31 },
    { label: "Peninsula Exhibit", sortOrder: 32 },
    { label: "Perimeter Exhibit", sortOrder: 33 },
    { label: "Tabletop exhibits", sortOrder: 34 },
    { label: "Other", sortOrder: 35 },
  ],
  // ── APEX vocabularies (ESG Part I §A/§G, IIIa §E, IIIb §B) ──
  event_type: [
    { label: "Board Meeting", sortOrder: 0 },
    { label: "City-Wide Convention", sortOrder: 1 },
    { label: "Committee Meeting", sortOrder: 2 },
    { label: "Customer Event", sortOrder: 3 },
    { label: "Educational Meeting", sortOrder: 4 },
    { label: "General Business Meeting", sortOrder: 5 },
    { label: "Incentive Travel", sortOrder: 6 },
    { label: "Local Employee Gathering", sortOrder: 7 },
    { label: "Product Launch", sortOrder: 8 },
    { label: "Public/Consumer Show", sortOrder: 9 },
    { label: "Sales Meeting", sortOrder: 10 },
    { label: "Shareholders Meeting", sortOrder: 11 },
    { label: "Special Event", sortOrder: 12 },
    { label: "Team-Building Event", sortOrder: 13 },
    { label: "Trade Show", sortOrder: 14 },
    { label: "Training Meeting", sortOrder: 15 },
    { label: "Video Conference", sortOrder: 16 },
    { label: "Other", sortOrder: 17 },
  ],
  event_scope: [
    { label: "Citywide", sortOrder: 0 },
    { label: "Single Venue", sortOrder: 1 },
    { label: "Multiple Venue", sortOrder: 2 },
    { label: "Other", sortOrder: 3 },
  ],
  event_frequency: [
    { label: "One Time Only", sortOrder: 0 },
    { label: "Biennial", sortOrder: 1 },
    { label: "Annual", sortOrder: 2 },
    { label: "Semi-Annual", sortOrder: 3 },
    { label: "Quarterly", sortOrder: 4 },
    { label: "Monthly", sortOrder: 5 },
    { label: "Other", sortOrder: 6 },
  ],
  // group is the canonical APEX meal bucket the ESG/PER attendance grids use.
  meal_type: [
    { label: "Continental Breakfast", group: "CONTINENTAL", sortOrder: 0 },
    { label: "Breakfast", group: "BREAKFAST", sortOrder: 1 },
    { label: "Brunch", group: "BRUNCH", sortOrder: 2 },
    { label: "Lunch", group: "LUNCH", sortOrder: 3 },
    { label: "Dinner", group: "DINNER", sortOrder: 4 },
    { label: "Break", group: "BREAK", sortOrder: 5 },
    { label: "Reception", group: "RECEPTION", sortOrder: 6 },
    { label: "Hospitality", group: "HOSPITALITY", sortOrder: 7 },
  ],
  service_style: [
    { label: "Boxed", sortOrder: 0 },
    { label: "Buffet", sortOrder: 1 },
    { label: "Plated", sortOrder: 2 },
  ],
  // Special meals: counted on catering orders, picked on speaker profiles.
  dietary_need: [
    { label: "Vegetarian", sortOrder: 0 },
    { label: "Vegan", sortOrder: 1 },
    { label: "Gluten-free", sortOrder: 2 },
    { label: "Dairy-free", sortOrder: 3 },
    { label: "Nut allergy", sortOrder: 4 },
    { label: "Shellfish allergy", sortOrder: 5 },
    { label: "Kosher", sortOrder: 6 },
    { label: "Halal", sortOrder: 7 },
  ],
  // Catering and RFP line items. "guests" is what an RFP line copied from a
  // catering order counts (src/lib/rfp/lineItems.ts).
  unit: [
    { label: "each", sortOrder: 0 },
    { label: "per person", sortOrder: 1 },
    { label: "guests", sortOrder: 2 },
    { label: "flat", sortOrder: 3 },
    { label: "per hour", sortOrder: 4 },
    { label: "per day", sortOrder: 5 },
  ],
  // Guest charges; group is the scope a new charge of the type starts with.
  hotel_charge: [
    { label: "Resort fee", group: "PER_NIGHT", sortOrder: 0 },
    { label: "Destination fee", group: "PER_NIGHT", sortOrder: 1 },
    { label: "Parking", group: "PER_NIGHT", sortOrder: 2 },
    { label: "Valet parking", group: "PER_NIGHT", sortOrder: 3 },
    { label: "Early departure fee", group: "PER_STAY", sortOrder: 4 },
  ],
  booth_type: [
    { label: "8'x10'", sortOrder: 0 },
    { label: "10'x10'", sortOrder: 1 },
    { label: "Island", sortOrder: 2 },
    { label: "Peninsula", sortOrder: 3 },
    { label: "Perimeter", sortOrder: 4 },
    { label: "Table Top", sortOrder: 5 },
  ],
  // APEX Post-Event Report lists.
  per_facility_type: [
    { label: "Convention Center", sortOrder: 0 },
    { label: "Hotel", sortOrder: 1 },
    { label: "Conference Center", sortOrder: 2 },
    { label: "Other Venue", sortOrder: 3 },
  ],
  per_housing_provider: [
    { label: "Event Organizer/Host", sortOrder: 0 },
    { label: "Management Firm", sortOrder: 1 },
    { label: "Housing Bureau", sortOrder: 2 },
    { label: "Convention & Visitors Bureau", sortOrder: 3 },
    { label: "Attendees Direct to Hotels", sortOrder: 4 },
    { label: "Other", sortOrder: 5 },
  ],
  per_av_setup: [
    { label: "Front projection", sortOrder: 0 },
    { label: "Rear projection", sortOrder: 1 },
    { label: "None", sortOrder: 2 },
    { label: "Other", sortOrder: 3 },
  ],
  // Hotels module. A proposal status's group is its workflow stage — the app
  // keys off REQUESTED / PENDING / ACCEPTED / DECLINED, never the label.
  proposal_status: [
    { label: "Lead Sent", color: "gray", group: "REQUESTED", sortOrder: 0 },
    { label: "Received", color: "blue", group: "PENDING", sortOrder: 1 },
    { label: "Under Review", color: "yellow", group: "PENDING", sortOrder: 2 },
    { label: "Accepted", color: "green", group: "ACCEPTED", sortOrder: 3 },
    { label: "Declined", color: "red", group: "DECLINED", sortOrder: 4 },
  ],
  hotel_room_type: [
    { label: "King", sortOrder: 0 },
    { label: "Double Queen", sortOrder: 1 },
    { label: "Suite", sortOrder: 2 },
  ],
  // A block's contract type; group is whether it carries attrition (CONTRACT)
  // or is held without it (COURTESY).
  hotel_contract_type: [
    { label: "Contract", group: "CONTRACT", sortOrder: 0 },
    { label: "Courtesy", group: "COURTESY", sortOrder: 1 },
  ],
  // Pickup checkpoints, in days before a block's first night: Hotel
  // Monitoring and the block page show pickup as it stood on each.
  hotel_days_out: [
    { label: "90", sortOrder: 0 },
    { label: "60", sortOrder: 1 },
    { label: "30", sortOrder: 2 },
    { label: "21", sortOrder: 3 },
    { label: "14", sortOrder: 4 },
    { label: "7", sortOrder: 5 },
  ],
  // Who a block's rooms are for; its contract type is hotel_contract_type.
  hotel_guest_type: [
    { label: "Attendees", sortOrder: 0 },
    { label: "Staff", sortOrder: 1 },
    { label: "Speakers", sortOrder: 2 },
    { label: "Exhibitors", sortOrder: 3 },
    { label: "VIP", sortOrder: 4 },
  ],
  // A hotel's fixed offering, filtered on when picking RFP recipients: what it
  // has or provides to every guest (pool, airport shuttle, valet parking,
  // complimentary breakfast). What's negotiated for the group (comp rooms, a
  // reduced valet rate, meal vouchers) is a concession (rfp_concession).
  hotel_amenity: [
    { label: "On-site Restaurant", sortOrder: 0 },
    { label: "Fitness Center", sortOrder: 1 },
    { label: "Indoor Pool", sortOrder: 2 },
    { label: "Outdoor Pool", sortOrder: 3 },
    { label: "Business Center", sortOrder: 4 },
    { label: "Airport Shuttle", sortOrder: 5 },
    { label: "Valet Parking", sortOrder: 6 },
    { label: "Spa", sortOrder: 7 },
    { label: "Golf", sortOrder: 8 },
    // Included for every guest; spelled as the concession they stand in for,
    // so a request for one reads as met by the hotel's profile.
    { label: "Complimentary Breakfast", sortOrder: 9 },
    { label: "Complimentary Wi-Fi", sortOrder: 10 },
  ],
  hotel_brand: [
    { label: "Hilton", sortOrder: 0 },
    { label: "Marriott", sortOrder: 1 },
    { label: "Hyatt", sortOrder: 2 },
    { label: "IHG", sortOrder: 3 },
    { label: "Choice Hotels", sortOrder: 4 },
    { label: "Wyndham", sortOrder: 5 },
    { label: "Best Western", sortOrder: 6 },
    { label: "Accor", sortOrder: 7 },
    { label: "Independent", sortOrder: 8 },
  ],
  // The APEX RFP's methods of reservation.
  reservation_method: [
    { label: "Individual Reservations", sortOrder: 0 },
    { label: "Rooming List", sortOrder: 1 },
  ],
  // Terms an RFP asks for; each RFP row adds its own value ("1/40", "20%").
  // group is the APEX "Concessions Desired" heading: ROOMS (guest rooms), FB
  // (food & beverage) or OTHER.
  rfp_concession: [
    { label: "Comp ratio", group: "ROOMS", sortOrder: 0 },
    { label: "Attrition", group: "ROOMS", sortOrder: 1 },
    { label: "Cut-off", group: "ROOMS", sortOrder: 2 },
    { label: "Rate cap", group: "ROOMS", sortOrder: 3 },
    { label: "Staff rate", group: "ROOMS", sortOrder: 4 },
    { label: "Upgrades", group: "ROOMS", sortOrder: 5 },
    { label: "Waived resort fee", group: "ROOMS", sortOrder: 6 },
    { label: "Complimentary breakfast", group: "ROOMS", sortOrder: 6 },
    { label: "F&B discount", group: "FB", sortOrder: 7 },
    { label: "Complimentary Wi-Fi", group: "OTHER", sortOrder: 8 },
    { label: "Parking", group: "OTHER", sortOrder: 9 },
    { label: "Deposit schedule", group: "OTHER", sortOrder: 10 },
    { label: "Waived meeting room rental", group: "OTHER", sortOrder: 11 },
  ],
  // What an "Other services" vendor RFP is for (Rfp.service).
  rfp_service: [
    { label: "Transportation", sortOrder: 0 },
    { label: "DMC", sortOrder: 1 },
    { label: "Security", sortOrder: 2 },
    { label: "Staffing", sortOrder: 3 },
    { label: "Photography", sortOrder: 4 },
  ],
  // Terms a vendor RFP asks for (AV, catering, print, other services); each
  // RFP row adds its own value ("50% at signing", "72 hours").
  rfp_term: [
    { label: "Deposit schedule", sortOrder: 0 },
    { label: "Payment terms", sortOrder: 1 },
    { label: "Cancellation", sortOrder: 2 },
    { label: "Overtime rate", sortOrder: 3 },
    { label: "Delivery window", sortOrder: 4 },
    { label: "Certificate of insurance", sortOrder: 5 },
    { label: "Price hold", sortOrder: 6 },
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
