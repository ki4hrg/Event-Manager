// One-off import of the Hotel-Manager database into one Event-Manager tenant.
//
//   HM_DATABASE_URL=postgres://… HM_UPLOADS_DIR=/hm-uploads \
//   DATABASE_URL=postgres://… UPLOAD_DIR=/data/uploads \
//   npx tsx scripts/import-hotel-manager.ts --tenant <slug> [--user <email>] [--apply]
//
// Without --apply it is a dry run: everything is written inside one
// transaction that is rolled back, and the report (event / hotel matches,
// counts, warnings) is printed. --apply commits, then copies proposal
// documents from HM_UPLOADS_DIR. It refuses to run into a tenant that already
// has hotel proposals.
//
// Mapping:
//   regions / areas / brands / room types / amenities / lead sources /
//   proposal statuses → the tenant's CustomOptions (created when missing)
//   event types → EventSeries; events → matched by name + start date (within
//   MATCH_DAYS, since the two apps disagree by a day on some events), else created
//   in the event type's series, or an existing series the name starts with
//   properties → lodging Venues (matched by name, else created with their Vendor);
//   point of contact → Contact + VenueContact
//   proposals (+ room grid, charges, amenities, documents, versions)
//   blocks (+ nights, charges); pickup reports → imports, guests, counts
// Dropped: rooms_remaining (never fed by pickup), pre_event_pickup_updates,
// lat/lng, venue types.

import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, statSync } from "fs";
import path from "path";
import { Prisma, PrismaClient, type HotelChargeScope, type HotelContractType, type HotelPickupMethod } from "@prisma/client";
import { dateFromKey, dateKey, nightKeys } from "../src/lib/hotels";
import { blockPickup, pickupByNight } from "../src/lib/hotelPickup";

// ---------------------------------------------------------------------------
// Args / env

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const APPLY = process.argv.includes("--apply");
const TENANT = arg("tenant");
const USER_EMAIL = arg("user");
const HM_URL = process.env.HM_DATABASE_URL;
const HM_UPLOADS = process.env.HM_UPLOADS_DIR;
// Mirrors src/lib/uploads.ts (not imported: it pulls in the app's Prisma singleton).
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/data/uploads";
const PROPOSAL_UPLOAD_DIR = "hotel-proposals";

if (!TENANT || !HM_URL) {
  console.error("Usage: HM_DATABASE_URL=… npx tsx scripts/import-hotel-manager.ts --tenant <slug> [--user <email>] [--apply]");
  process.exit(1);
}

const em = new PrismaClient();
const hm = new PrismaClient({ datasourceUrl: HM_URL });

type Row = Record<string, unknown>;
const q = <T = Row>(sql: string) => hm.$queryRawUnsafe<T[]>(sql);

const warnings: string[] = [];
const warn = (msg: string) => warnings.push(msg);
const s = (v: unknown) => (v == null || v === "" ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));
const day = (v: unknown) => (v instanceof Date ? dateKey(v) : typeof v === "string" && v ? v.slice(0, 10) : null);
const norm = (v: string) => v.trim().toLowerCase();

// Event start as a date key in the event's timezone.
function localDateKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
// Wall-clock time in tz → UTC instant (same approach as src/lib/timezones.ts).
function zoned(dateKeyStr: string, time: string, tz: string): Date {
  const guess = new Date(`${dateKeyStr}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asIfUtc - guess.getTime()));
}

const SCOPE: Record<string, HotelChargeScope> = {
  "per-night": "PER_NIGHT",
  "per-stay": "PER_STAY",
  "per-person": "PER_PERSON",
  "per-person-per-night": "PER_PERSON_PER_NIGHT",
};
// Hotel-Manager's single block type → contract type + guest type (staff blocks are contracted).
const BLOCK_TYPE: Record<string, { contractType: HotelContractType; guestType: string }> = {
  contract: { contractType: "CONTRACT", guestType: "Attendees" },
  courtesy: { contractType: "COURTESY", guestType: "Attendees" },
  staff: { contractType: "CONTRACT", guestType: "Staff" },
};
const blockTypeText = (raw: unknown) => {
  const t = BLOCK_TYPE[String(raw)];
  return t ? `${t.contractType === "CONTRACT" ? "Contract" : "Courtesy"} · ${t.guestType}` : null;
};
const PICKUP_METHOD: Record<string, HotelPickupMethod> = { merge: "MERGE", replace: "REPLACE", append: "APPEND", "manual-count": "COUNTS" };
const RESERVATION_METHOD: Record<string, string> = { "self-book": "Individual Reservations", "rooming-list": "Rooming List" };
const STAGE_COLOR: Record<string, string> = { REQUESTED: "gray", PENDING: "blue", ACCEPTED: "green", DECLINED: "red" };
const FIELD_LABEL: Record<string, string> = {
  event_id: "Event", property_id: "Hotel", lead_source_id: "Lead source", submission_date: "Submitted", block_type: "Block type",
  status_id: "Status", declined_reason: "Declined reason", earliest_checkin_date: "Check-in", latest_checkout_date: "Check-out",
  notes: "Notes", is_run_of_house: "Run of house", allowed_attrition: "Allowed attrition %", guaranteed_revenue: "Guaranteed revenue",
};

const MATCH_DAYS = 3;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

class DryRun extends Error {}

async function main() {
  const tenant = await em.tenant.findFirst({ where: { OR: [{ slug: TENANT }, { id: TENANT }] } });
  if (!tenant) throw new Error(`Tenant not found: ${TENANT}`);
  const tenantId = tenant.id;
  if (APPLY && (await em.hotelProposal.count({ where: { event: { tenantId } } })) > 0) {
    throw new Error(`Tenant ${tenant.name} already has hotel proposals — refusing to import twice.`);
  }
  const actingUser = USER_EMAIL ? await em.user.findUnique({ where: { email: USER_EMAIL } }) : null;
  if (USER_EMAIL && !actingUser) throw new Error(`User not found: ${USER_EMAIL}`);

  // ---- Read Hotel-Manager -------------------------------------------------
  const [
    regions, areas, brands, roomTypes, amenityTags, leadSources, statuses, eventTypes, settings, hmUsers,
    events, venues, eventVenues, contacts, properties, distances,
    proposals, proposalRooms, proposalCharges, proposalAmenities, documents,
    versions, versionChanges, versionRooms, versionCharges, versionAmenities,
    blocks, blockRooms, blockCharges, reports, guests, counts,
  ] = await Promise.all([
    q("select * from regions"), q("select * from areas"), q("select * from parent_brands"), q("select * from room_types"),
    q("select * from amenity_tags"), q("select * from lead_sources"), q("select * from proposal_statuses order by display_order"),
    q("select * from event_types"), q("select * from settings"), q("select id, email from users"),
    q("select * from events"), q("select * from venues"), q("select * from event_venues"), q("select * from points_of_contact"),
    q("select * from properties"), q("select * from venue_property_distances"),
    q("select * from proposals order by created_at"), q("select * from proposal_room_types"), q("select * from proposal_charges order by created_at"),
    q("select * from proposal_amenities"), q("select * from proposal_documents"),
    q("select * from proposal_versions order by version_number"), q("select * from proposal_version_changes"),
    q("select * from proposal_version_room_types"), q("select * from proposal_version_charges"), q("select * from proposal_version_amenities"),
    q("select * from blocks"), q("select * from block_room_types"), q("select * from block_charges order by created_at"),
    q("select * from pickup_reports order by created_at"), q("select * from pickup_report_guests"), q("select * from pickup_report_counts"),
  ]);
  const byId = (rows: Row[]) => new Map(rows.map((r) => [r.id as string, r]));
  const regionById = byId(regions), areaById = byId(areas), brandById = byId(brands), roomTypeById = byId(roomTypes);
  const amenityById = byId(amenityTags), leadById = byId(leadSources), statusById = byId(statuses), eventTypeById = byId(eventTypes);
  const contactById = byId(contacts), propertyById = byId(properties), proposalById = byId(proposals), hmUserById = byId(hmUsers);
  const hmEventById = byId(events), hmVenueById = byId(venues);
  const defaultTz = s(settings.find((r) => r.setting_key === "default_timezone")?.setting_value) ?? "America/New_York";

  // HM user → EM user by email (attribution only).
  const emUsers = await em.user.findMany({ select: { id: true, email: true } });
  const emUserFor = (hmUserId: unknown) => {
    const email = s(hmUserById.get(hmUserId as string)?.email);
    return (email && emUsers.find((u) => norm(u.email) === norm(email))?.id) ?? actingUser?.id ?? null;
  };

  const roomTypeName = (r: Row) => s(roomTypeById.get(r.room_type_id as string)?.name) ?? s(r.room_type_name);

  const report = {
    options: 0, series: 0, eventsMatched: [] as string[], eventsCreated: [] as string[], eventsSkipped: [] as string[],
    hotelsMatched: [] as string[], hotelsCreated: [] as string[], venuesCreated: 0, contacts: 0,
    proposals: 0, versions: 0, documents: 0, blocks: 0, guests: 0, counts: 0, imports: 0,
  };
  const filesToCopy: { from: string; to: string }[] = [];

  try {
    await em.$transaction(
      async (tx) => {
        // ---- Options ------------------------------------------------------
        const existing = await tx.customOption.findMany({ where: { tenantId }, select: { category: true, label: true } });
        const has = new Set(existing.map((o) => `${o.category}|${norm(o.label)}`));
        const labelFor = new Map(existing.map((o) => [`${o.category}|${norm(o.label)}`, o.label]));
        const option = async (category: string, label: string | null, extra: { group?: string | null; color?: string } = {}) => {
          if (!label) return null;
          const key = `${category}|${norm(label)}`;
          if (has.has(key)) return labelFor.get(key)!;
          const max = await tx.customOption.aggregate({ where: { tenantId, category }, _max: { sortOrder: true } });
          await tx.customOption.create({
            data: { tenantId, category, label: label.trim(), group: extra.group ?? null, color: extra.color ?? null, sortOrder: (max._max.sortOrder ?? -1) + 1 },
          });
          has.add(key);
          labelFor.set(key, label.trim());
          report.options++;
          return label.trim();
        };
        for (const r of regions) await option("hotel_region", s(r.name));
        for (const a of areas) await option("hotel_area", s(a.name), { group: s(regionById.get(a.region_id as string)?.name) });
        for (const b of brands) await option("hotel_brand", s(b.name));
        for (const r of roomTypes) await option("hotel_room_type", s(r.name));
        for (const a of amenityTags) await option("hotel_amenity", s(a.name));
        for (const l of leadSources) await option("hotel_lead_source", s(l.name));
        for (const st of statuses) {
          const stage = String(st.status_type).toUpperCase();
          await option("proposal_status", s(st.name), { group: stage, color: STAGE_COLOR[stage] });
        }
        const roomTypeLabel = async (name: string | null) => (name ? option("hotel_room_type", name) : null);

        // ---- Series & events ----------------------------------------------
        const seriesId = new Map<string, string>();
        for (const et of eventTypes) {
          const name = s(et.name)!;
          const found = await tx.eventSeries.findFirst({ where: { tenantId, name: { equals: name, mode: "insensitive" } } });
          const series = found ?? (await tx.eventSeries.create({ data: { tenantId, name } }));
          if (!found) report.series++;
          seriesId.set(et.id as string, series.id);
        }

        // "Annual Conference 2025" → the "Annual Conference" series (longest prefix wins).
        const allSeries = await tx.eventSeries.findMany({ where: { tenantId }, select: { id: true, name: true } });
        const seriesByPrefix = (name: string) =>
          allSeries
            .filter((x) => norm(name).startsWith(norm(x.name)))
            .sort((a, b) => b.name.length - a.name.length)[0]?.id;

        const emEvents = await tx.event.findMany({ where: { tenantId }, select: { id: true, name: true, startDate: true, timezone: true, actualAttendance: true, membershipCount: true } });
        const eventMap = new Map<string, { id: string; timezone: string }>();
        // Venues by name (case-insensitive) — HM venues and properties both land here.
        const emVenues = await tx.venue.findMany({ where: { tenantId }, select: { id: true, name: true, isLodging: true, brand: true, area: true, address: true, city: true } });
        const venueByName = new Map(emVenues.map((v) => [norm(v.name), v]));
        const ensureVenue = async (r: Row, lodging: boolean) => {
          const name = s(r.name)!;
          const found = venueByName.get(norm(name));
          if (found) return { venue: found, created: false };
          const venue = await tx.venue.create({
            data: {
              tenantId,
              name,
              address: s(r.street_address) ?? s(r.address),
              city: s(r.city),
              state: s(r.state),
              zip: s(r.postal_code),
              country: s(r.country),
              isLodging: lodging,
            },
          });
          await tx.vendor.create({ data: { tenantId, name, venueId: venue.id } });
          const v = { id: venue.id, name, isLodging: lodging, brand: null, area: null, address: venue.address, city: venue.city };
          venueByName.set(norm(name), v);
          return { venue: v, created: true };
        };

        const neededEvents = new Set(proposals.map((p) => p.event_id as string));
        for (const e of events) {
          if (!neededEvents.has(e.id as string)) continue;
          const name = s(e.name)!;
          const start = day(e.start_date);
          const sameName = emEvents.filter((x) => norm(x.name) === norm(name));
          const match = start
            ? sameName
                .filter((x) => daysApart(localDateKey(x.startDate, x.timezone), start) <= MATCH_DAYS)
                .sort((a, b) => daysApart(localDateKey(a.startDate, a.timezone), start) - daysApart(localDateKey(b.startDate, b.timezone), start))[0]
            : sameName.length === 1
              ? sameName[0]
              : undefined;
          const tz = s(e.timezone) ?? defaultTz;
          if (match) {
            eventMap.set(e.id as string, { id: match.id, timezone: match.timezone });
            const emStart = localDateKey(match.startDate, match.timezone);
            report.eventsMatched.push(`${name} (${start ?? "no date"}) → existing event starting ${emStart}${start && emStart !== start ? " (dates differ)" : ""}`);
            const fill: Prisma.EventUpdateInput = {};
            if (match.actualAttendance == null && e.attendance != null) fill.actualAttendance = n(e.attendance);
            if (match.membershipCount == null && e.membership != null) Object.assign(fill, { membershipCount: n(e.membership), isMembershipBased: true });
            if (Object.keys(fill).length) await tx.event.update({ where: { id: match.id }, data: fill });
            continue;
          }
          if (!start) {
            report.eventsSkipped.push(`${name} — no start date and no single name match; its proposals are skipped`);
            continue;
          }
          const end = day(e.end_date) ?? start;
          const created = await tx.event.create({
            data: {
              tenantId,
              name,
              description: s(e.location),
              startDate: zoned(start, "08:00", tz),
              endDate: zoned(end, "17:00", tz),
              timezone: tz,
              seriesId: (e.event_type_id ? seriesId.get(e.event_type_id as string) : undefined) ?? seriesByPrefix(name),
              actualAttendance: n(e.attendance),
              membershipCount: n(e.membership),
              isMembershipBased: e.membership != null,
            },
          });
          eventMap.set(e.id as string, { id: created.id, timezone: tz });
          const series = allSeries.find((x) => x.id === ((e.event_type_id ? seriesId.get(e.event_type_id as string) : undefined) ?? seriesByPrefix(name)));
          report.eventsCreated.push(`${name} (${start})${series ? ` in series ${series.name}` : ""}`);
          let order = 0;
          for (const ev of eventVenues.filter((x) => x.event_id === e.id)) {
            const hv = hmVenueById.get(ev.venue_id as string);
            if (!hv) continue;
            const { venue, created: isNew } = await ensureVenue(hv, false);
            if (isNew) report.venuesCreated++;
            await tx.eventVenue.create({ data: { eventId: created.id, venueId: venue.id, sortOrder: order++ } });
          }
        }

        // ---- Hotels -------------------------------------------------------
        const hotelMap = new Map<string, string>();
        const neededProps = new Set(proposals.map((p) => p.property_id as string));
        for (const p of properties) {
          if (!neededProps.has(p.id as string)) continue;
          const { venue, created } = await ensureVenue(p, true);
          const brand = await option("hotel_brand", s(brandById.get(p.parent_brand_id as string)?.name));
          const area = await option("hotel_area", s(areaById.get(p.area_id as string)?.name) ?? s(p.area));
          await tx.venue.update({
            where: { id: venue.id },
            data: { isLodging: true, brand: venue.brand ?? brand, area: venue.area ?? area },
          });
          (created ? report.hotelsCreated : report.hotelsMatched).push(s(p.name)!);
          hotelMap.set(p.id as string, venue.id);

          const poc = contactById.get(p.point_of_contact_id as string);
          if (poc) {
            const email = s(poc.email);
            const [firstName, ...rest] = String(poc.name).trim().split(/\s+/);
            const contact =
              (email && (await tx.contact.findFirst({ where: { tenantId, email: { equals: email, mode: "insensitive" } } }))) ||
              (await tx.contact.create({
                data: { tenantId, firstName: firstName ?? String(poc.name), lastName: rest.join(" "), email, phone: s(poc.phone_number), organization: s(p.name), roles: ["Venue Contact"] },
              }));
            report.contacts++;
            await tx.venueContact.upsert({
              where: { venueId_contactId: { venueId: venue.id, contactId: contact.id } },
              create: { venueId: venue.id, contactId: contact.id, role: "Sales" },
              update: {},
            });
          }
        }

        // ---- Proposals ----------------------------------------------------
        const proposalMap = new Map<string, string>();
        const gridFor = async (rows: Row[], ROH: boolean, stay: string[]) => {
          const out: { roomType: string | null; night: Date; rate: number | null; rooms: number | null }[] = [];
          for (const r of rows) {
            const roomType = ROH ? null : await roomTypeLabel(roomTypeName(r));
            const nights = day(r.night_date) ? [day(r.night_date)!] : stay; // legacy rows without a night cover the stay
            for (const k of nights) out.push({ roomType, night: dateFromKey(k), rate: n(r.rate_per_night), rooms: n(r.number_available) });
          }
          return out;
        };
        const nameOf = (field: string, v: unknown) => {
          if (v == null) return null;
          if (field === "status_id") return s(statusById.get(v as string)?.name) ?? String(v);
          if (field === "property_id") return s(propertyById.get(v as string)?.name) ?? String(v);
          if (field === "lead_source_id") return s(leadById.get(v as string)?.name) ?? String(v);
          if (field === "event_id") return s(hmEventById.get(v as string)?.name) ?? String(v);
          return String(v);
        };

        for (const p of proposals) {
          const event = eventMap.get(p.event_id as string);
          const venueId = hotelMap.get(p.property_id as string);
          if (!event || !venueId) continue;
          const ROH = p.is_run_of_house === true;
          const checkIn = day(p.earliest_checkin_date);
          const checkOut = day(p.latest_checkout_date);
          const stay = nightKeys(checkIn, checkOut);
          const status = await option("proposal_status", s(statusById.get(p.status_id as string)?.name) ?? "Received");
          const created = await tx.hotelProposal.create({
            data: {
              eventId: event.id,
              venueId,
              status: status!,
              leadSource: await option("hotel_lead_source", s(leadById.get(p.lead_source_id as string)?.name)),
              contractType: BLOCK_TYPE[String(p.block_type)]?.contractType ?? null,
              guestType: await option("hotel_guest_type", BLOCK_TYPE[String(p.block_type)]?.guestType ?? null),
              submittedOn: day(p.submission_date) ? dateFromKey(day(p.submission_date)!) : null,
              checkIn: checkIn ? dateFromKey(checkIn) : null,
              checkOut: checkOut ? dateFromKey(checkOut) : null,
              declinedReason: s(p.declined_reason),
              notes: s(p.notes),
              revision: n(p.revision_number) ?? 1,
              allowedAttrition: n(p.allowed_attrition),
              guaranteedRevenue: n(p.guaranteed_revenue),
              amenities: proposalAmenities
                .filter((a) => a.proposal_id === p.id)
                .map((a) => s(amenityById.get(a.amenity_tag_id as string)?.name))
                .filter((x): x is string => !!x),
              createdAt: p.created_at as Date,
              nights: { create: await gridFor(proposalRooms.filter((r) => r.proposal_id === p.id), ROH, stay) },
              charges: {
                create: proposalCharges
                  .filter((c) => c.proposal_id === p.id)
                  .map((c, i) => ({ chargeType: String(c.charge_type), amount: n(c.amount), scope: SCOPE[String(c.scope)] ?? null, sortOrder: i })),
              },
            },
            include: { venue: { select: { name: true } }, nights: true, charges: true },
          });
          proposalMap.set(p.id as string, created.id);
          report.proposals++;

          // Versions: HM's, with ids resolved to names; the current revision's
          // snapshot is the proposal as imported (HM's child snapshots were
          // taken before the edit).
          const current = {
            venueName: created.venue.name, status: created.status, leadSource: created.leadSource, blockType: blockTypeText(p.block_type),
            submittedOn: day(created.submittedOn), checkIn, checkOut, declinedReason: created.declinedReason, notes: created.notes,
            allowedAttrition: created.allowedAttrition?.toString() ?? null,
            guaranteedRevenue: created.guaranteedRevenue?.toString() ?? null, amenities: [...created.amenities].sort(),
            nights: created.nights.map((x) => ({ roomType: x.roomType, night: dateKey(x.night), rate: x.rate?.toString() ?? null, rooms: x.rooms })),
            charges: created.charges.map((c) => ({ chargeType: c.chargeType, amount: c.amount?.toString() ?? null, scope: c.scope })),
          };
          const hmVersions = versions.filter((v) => v.proposal_id === p.id);
          const revisions = new Set(hmVersions.map((v) => n(v.version_number)!));
          for (const v of hmVersions) {
            const rev = n(v.version_number)!;
            const isCurrent = rev === created.revision;
            const snapshot = isCurrent
              ? current
              : {
                  venueName: nameOf("property_id", v.property_id), status: nameOf("status_id", v.status_id),
                  leadSource: nameOf("lead_source_id", v.lead_source_id), blockType: blockTypeText(v.block_type),
                  submittedOn: day(v.submission_date), checkIn: day(v.earliest_checkin_date), checkOut: day(v.latest_checkout_date),
                  declinedReason: s(v.declined_reason), notes: s(v.notes),
                  allowedAttrition: s(v.allowed_attrition), guaranteedRevenue: s(v.guaranteed_revenue),
                  amenities: versionAmenities.filter((a) => a.version_id === v.id).map((a) => s(a.amenity_name)).filter(Boolean).sort(),
                  nights: versionRooms
                    .filter((r) => r.version_id === v.id && day(r.night_date))
                    .map((r) => ({ roomType: v.is_run_of_house ? null : roomTypeName(r), night: day(r.night_date), rate: s(r.rate_per_night), rooms: n(r.number_available) })),
                  charges: versionCharges.filter((c) => c.version_id === v.id).map((c) => ({ chargeType: s(c.charge_type), amount: s(c.amount), scope: SCOPE[String(c.scope)] ?? null })),
                  legacy: true,
                };
            const changes = versionChanges
              .filter((c) => c.version_id === v.id)
              .map((c) => {
                const field = String(c.field_name);
                return {
                  field: [s(c.entity_description), FIELD_LABEL[field] ?? field].filter(Boolean).join(": "),
                  from: nameOf(field, c.old_value),
                  to: nameOf(field, c.new_value),
                };
              });
            await tx.hotelProposalVersion.create({
              data: {
                proposalId: created.id, revision: rev, summary: s(v.change_summary), snapshot: snapshot as Prisma.InputJsonValue, changes,
                createdById: actingUser?.id ?? null, createdAt: v.created_at as Date,
              },
            });
            report.versions++;
          }
          if (!revisions.has(created.revision)) {
            await tx.hotelProposalVersion.create({
              data: { proposalId: created.id, revision: created.revision, snapshot: current, createdById: actingUser?.id ?? null, createdAt: p.updated_at as Date },
            });
          }

          for (const d of documents.filter((x) => x.proposal_id === p.id)) {
            const storedName = `${randomUUID()}${path.extname(String(d.file_name))}`;
            await tx.fileUpload.create({
              data: {
                fileName: String(d.file_name), storedName, mimeType: String(d.file_type), fileSize: Number(d.file_size),
                hotelProposalId: created.id, createdAt: d.uploaded_at as Date,
              },
            });
            filesToCopy.push({ from: String(d.storage_path), to: path.join(UPLOAD_DIR, PROPOSAL_UPLOAD_DIR, created.id, storedName) });
            report.documents++;
          }
        }

        // ---- Blocks & pickup ---------------------------------------------
        for (const b of blocks) {
          const proposalId = proposalMap.get(b.proposal_id as string);
          if (!proposalId) continue;
          const hmProposal = proposalById.get(b.proposal_id as string)!;
          const ROH = b.is_run_of_house === true;
          const checkIn = day(b.checkin_date);
          const checkOut = day(b.checkout_date);
          const stay = nightKeys(checkIn, checkOut);
          const contracted = await gridFor(proposalRooms.filter((r) => r.proposal_id === b.proposal_id), ROH, nightKeys(day(hmProposal.earliest_checkin_date), day(hmProposal.latest_checkout_date)));
          const hmEventVenues = eventVenues.filter((x) => x.event_id === hmProposal.event_id).map((x) => x.venue_id);
          const dist = distances.find((d) => d.property_id === hmProposal.property_id && hmEventVenues.includes(d.venue_id));
          const nights: Prisma.HotelBlockNightCreateWithoutBlockInput[] = [];
          for (const r of blockRooms.filter((x) => x.block_id === b.id)) {
            const roomType = ROH ? null : await roomTypeLabel(roomTypeName(r));
            const keys = day(r.night_date) ? [day(r.night_date)!] : stay;
            for (const k of keys) {
              const signed = contracted.find((c) => c.roomType === roomType && dateKey(c.night) === k);
              nights.push({
                roomType, night: dateFromKey(k), rate: n(r.rate_per_night), rooms: n(r.number_available) ?? 0,
                contractedRooms: signed?.rooms ?? n(r.number_available), otherReservations: n(r.manual_reservations) ?? 0,
              });
            }
          }
          const block = await tx.hotelBlock.create({
            data: {
              proposalId,
              isHq: false,
              checkIn: checkIn ? dateFromKey(checkIn) : null,
              checkOut: checkOut ? dateFromKey(checkOut) : null,
              reservationMethod: b.reservation_method ? await option("reservation_method", RESERVATION_METHOD[String(b.reservation_method)] ?? String(b.reservation_method)) : null,
              groupCode: s(b.group_code),
              bookingLink: s(b.booking_link),
              bookingPhone: s(b.booking_phone),
              cutoffDate: day(b.reservation_deadline) ? dateFromKey(day(b.reservation_deadline)!) : null,
              contractedOn: day(b.created_date) ? dateFromKey(day(b.created_date)!) : null,
              allowedAttrition: n(b.allowed_attrition),
              guaranteedRevenue: n(b.guaranteed_revenue),
              distanceMiles: n(b.distance_from_venue) ?? n(dist?.distance_miles),
              driveMinutes: n(b.drive_time) ?? n(dist?.drive_time_minutes),
              notes: s(b.notes),
              createdAt: b.created_at as Date,
              nights: { create: nights },
              charges: {
                create: blockCharges
                  .filter((c) => c.block_id === b.id)
                  .map((c, i) => ({ chargeType: String(c.charge_type), amount: n(c.amount), scope: SCOPE[String(c.scope)] ?? null, sortOrder: i })),
              },
            },
          });
          report.blocks++;

          for (const r of reports.filter((x) => x.block_id === b.id)) {
            const rGuests = guests.filter((g) => g.pickup_report_id === r.id);
            const rCounts = counts.filter((c) => c.pickup_report_id === r.id);
            const imp = await tx.hotelPickupImport.create({
              data: {
                blockId: block.id, method: PICKUP_METHOD[String(r.import_method)] ?? "APPEND", inserted: rGuests.length || rCounts.length,
                notes: s(r.notes), importedById: emUserFor(r.imported_by), createdAt: r.created_at as Date,
              },
            });
            report.imports++;
            for (const g of rGuests) {
              await tx.hotelPickupGuest.create({
                data: {
                  blockId: block.id, importId: imp.id, guestName: s(g.guest_name), confirmationNumber: s(g.confirmation_number),
                  checkIn: day(g.checkin_date) ? dateFromKey(day(g.checkin_date)!) : null,
                  checkOut: day(g.checkout_date) ? dateFromKey(day(g.checkout_date)!) : null,
                  roomType: ROH ? s(g.room_type) : await roomTypeLabel(s(g.room_type)),
                  cancelled: g.status === "cancelled", rawStatus: s(g.raw_status_value),
                },
              });
              report.guests++;
            }
            for (const c of rCounts) {
              await tx.hotelPickupCount.create({
                data: { blockId: block.id, night: dateFromKey(day(c.date)!), roomType: ROH ? null : await roomTypeLabel(s(c.room_type_name)), rooms: n(c.number_of_rooms) ?? 0 },
              });
              report.counts++;
            }
          }

          const full = await tx.hotelBlock.findUniqueOrThrow({
            where: { id: block.id },
            select: { nights: true, pickupGuests: true, pickupCounts: true },
          });
          const event = eventMap.get(hmProposal.event_id as string)!;
          await tx.hotelPickupSnapshot.create({
            data: {
              blockId: block.id,
              takenOn: dateFromKey(localDateKey(new Date(), event.timezone)),
              nights: pickupByNight(blockPickup({ nights: full.nights, guests: full.pickupGuests, counts: full.pickupCounts })),
            },
          });
        }

        if (!APPLY) throw new DryRun();
      },
      { timeout: 10 * 60_000, maxWait: 60_000 },
    );
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }

  // ---- Files (after commit) ------------------------------------------------
  let copied = 0;
  const missing: string[] = [];
  for (const f of filesToCopy) {
    const from = HM_UPLOADS ? path.resolve(HM_UPLOADS, f.from) : null;
    if (!from || !from.startsWith(path.resolve(HM_UPLOADS!) + path.sep) || !existsSync(from) || !statSync(from).isFile()) {
      missing.push(f.from);
      continue;
    }
    if (APPLY) {
      mkdirSync(path.dirname(f.to), { recursive: true });
      copyFileSync(from, f.to);
    }
    copied++;
  }

  // ---- Report --------------------------------------------------------------
  const list = (title: string, items: string[]) => {
    console.log(`\n${title} (${items.length})`);
    for (const i of items) console.log(`  - ${i}`);
  };
  console.log(`${APPLY ? "IMPORTED" : "DRY RUN (rolled back)"} into tenant ${tenant.name} (${tenant.slug})`);
  list("Events matched to existing", report.eventsMatched);
  list("Events created", report.eventsCreated);
  list("Events skipped", report.eventsSkipped);
  list("Hotels matched to existing venues", report.hotelsMatched);
  list("Hotels created", report.hotelsCreated);
  console.log(
    `\nOptions created ${report.options}, series ${report.series}, other venues ${report.venuesCreated}, contacts linked ${report.contacts}` +
      `\nProposals ${report.proposals}, versions ${report.versions}, documents ${report.documents} (${copied} files ${APPLY ? "copied" : "found"})` +
      `\nBlocks ${report.blocks}, pickup imports ${report.imports}, guests ${report.guests}, counts ${report.counts}`,
  );
  if (missing.length) list("Document files not found", missing);
  if (warnings.length) list("Warnings", warnings);
  console.log("\nAfter import: mark each event's HQ hotel on its block (Hotel-Manager had no HQ flag).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await em.$disconnect();
    await hm.$disconnect();
  });
