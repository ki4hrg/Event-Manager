# Hotels module

Ported from Hotel-Manager. Sleeping-room blocks for an event, from proposal to post-event pickup.

## Model

| Concept | Where |
|---|---|
| Hotel | A `Venue` with `isLodging` (+ `brand`, `area` option labels). `/hotels` lists them. |
| Block type | Two fields on `HotelProposal` (and `RfpHotelBlock`): `contractType` (fixed enum: `CONTRACT` carries attrition, `COURTESY` is held without it) and `guestType` (a `hotel_guest_type` option label — Attendees, Staff, Speakers, Exhibitors, VIP). Shown together by `blockTypeLabel` ("Contract · Staff"). Staff is a guest type, never a contract type. |
| Room grid | `RoomGridEditor` (proposals, RFP blocks): each night has a Total; typed room types are counts within it and Run of House is the remainder (never entered, so typed rooms can't exceed the total — saving is blocked when they do). Zeros are stored as 0. |
| Run of House | A room type: a night whose `roomType` is null (`RUN_OF_HOUSE` / `roomTypeLabel` in `src/lib/hotels.ts`). It can sit beside typed rooms in one grid ("Run of House 40 + Suite 5"). There is no block-level flag. |
| Proposal | `HotelProposal` — one hotel's offer for one event: status (a `proposal_status` option whose `group` is the stage REQUESTED / PENDING / ACCEPTED / DECLINED), room grid (`HotelProposalNight`: room type × night → rooms, rate), charges, amenities, terms, documents (`FileUpload.hotelProposalId`). |
| Revisions | `HotelProposalVersion` — every save refreshes the current revision's snapshot; raising `revision` freezes the previous one and records a field diff. |
| Block | `HotelBlock` — an accepted proposal turned into the booked block (1:1). Nights keep `contractedRooms` (as signed) next to `rooms` (current / final) and `otherReservations`. |
| Pickup | `HotelPickupGuest` (hotel's guest list; merge by confirmation # is scoped to the block), `HotelPickupCount` (entered nightly totals), `HotelPickupImport` (history). |
| Booking dates | `HotelPickupGuest.bookedOn` / `cancelledOn`, when the hotel's report has them (mapped in the CSV wizard; settable per guest via MCP `update_hotel_pickup_guest`). A merge never clears a known date; before the block starts, a guest new in a merge (or newly cancelled) without a date gets the import day. |
| Snapshots | `HotelPickupSnapshot` — pickup per night as of a day, written on every pickup change. |

Pickup is computed, never stored per night: `src/lib/hotelPickup.ts` is the single calculation (guests staying that night + entered counts + other reservations). Guests keep the room type they actually had. A guest or count lands on its own room type when the block names it; any other type pools into the block's Run of House allotment, or counts outside the block when it has none. Attrition: a block is "at risk" when pickup % < 100 − allowed attrition.

## RFPs

What we ask hotels for, before any proposal comes back. `Rfp` (generic, `kind = HOTEL`) with requested `RfpHotelBlock`s — one per contract type + guest type, each a night × room type grid of requested rooms plus a target rate — and `RfpConcession`s (labels from the `rfp_concession` option list, free-text values, required or not).

- **Editor** — `/events/[id]/hotels/rfps/[rfpId]`: details (requested arrival / departure, peak rooms, alternate dates, decision timeline and decision maker — a contact or typed —, hotel areas (`Rfp.areas`, else the event's `Event.hotelAreas`, set on the event's Hotels page; they filter the *Add hotel* picker and print as the APEX location), reservation method, F&B minimum, requested amenities) and document parts; blocks (shared `RoomGridEditor`; a new block's nights are the RFP's arrival–departure filled with peak rooms, and each block can add or drop edge days); function space and F&B as two cards of `RfpSpaceRequest` rows (`RfpSpaceEditor`, saved per kind): entered by hand, or copied in with *Add from functions* / *Add from catering orders* (`functionSpaceRows` / `cateringSpaceRows` in `src/lib/rfp/space.ts`); items not scheduled yet come through with no day ("Day TBD"); concessions (picked from `rfp_concession`, whose option `group` — ROOMS / FB / OTHER — is the APEX "Concessions Desired" heading). *Fill from history* fills a block from past pickup, filtered by contract type and guest type (the block's own by default, or any) (`patternStats` / `proposedRoles` / `proposeNights` in `src/lib/hotelPattern.ts`); the pattern report's *Use in RFP* starts a new RFP the same way.
- **Document** — `src/lib/rfp/document.ts` builds one `RfpDocument` in APEX Single Facility RFP order (`docs/apex/APEX_Single_Facility_RFP.pdf`): I contact information; II event profile (from the ESG §A / §D when filled in) and event history; III requirements — statement of need, preferred and alternate dates, a derived facility summary (room nights, peak night, largest function, rooms at once), guest room blocks (night × room type, as on the APEX and hotel forms), function space and F&B by day, requested amenities, concessions by heading, other requirements; IV proposal specifications and attachments; V a blank response form. Blocks, function space, F&B, concessions, history, other requirements and the response form are optional (`Rfp.sections`). Rendered by `RfpDocumentView` (`/print`) and `src/lib/rfp/renderDocx.ts` (`/api/events/[id]/rfps/[rfpId]?format=docx`).
- **Recipients** — `RfpRecipient` per hotel: sent date, declined to bid. State is derived (`recipientState` in `src/lib/rfp/recipients.ts`): not sent / due in n days / overdue / declined / responded. *Record response* opens a new proposal prefilled from the requested block (`?rfpBlockId=`); creating it links `HotelProposal.rfpId` / `rfpBlockId` and adds the hotel as a recipient if it wasn't listed. Blocks are saved in place by id so those links survive edits.
- **Concession answers** — a proposal answering an RFP records, per requested concession, Met / Partial / Not met plus what was offered (`HotelProposalConcession`). RFP concessions are saved in place by id; removing one drops its answers. Not part of the proposal's revision snapshot.
- **Bid comparison** — `/events/[id]/hotels/rfps/[rfpId]/compare` (+ `/print`, `?doc=compare` .docx): one group per requested block, a column per hotel — room nights and peak vs requested, average rate vs target, room revenue, attrition, charges, amenities (missing requested ones flagged), each concession, each night with shortfall. Built by `buildComparison` / `comparisonRows` (`src/lib/rfp/compare.ts`), shared by the page and the .docx.
- **Issue** — files the rendered .docx on the RFP (`file_type` "RFP"), stamps `issuedOn`, moves Draft → Issued.
- Not shareable: RFPs go out as files.
- **MCP** — `src/lib/mcpTools/rfps.ts`: `list_rfps` / `get_rfp`, `create_rfp` / `update_rfp` / `delete_rfp`, `set_rfp_blocks` / `set_rfp_concessions` / `set_rfp_space_requests` (pass existing ids to keep links), `add_rfp_recipients` / `update_rfp_recipient` / `remove_rfp_recipient`, `record_rfp_response` (a proposal seeded from the requested block), `get_rfp_comparison`. `update_hotel_proposal` takes concession answers. Issuing the .docx stays in the app.

## ESG / PER

`loadHousingInput` (`src/lib/esg/housing.ts`) reports an event's blocks with `source: "hotels"`: ESG §G room blocks by night (final rooms), PER §III hotel count and peak night (actual pickup), PER §IV per hotel contracted / final / pickup at 90, 60, 30, 21, 14, 7 days before the first night / actual. A days-out cell comes from booking dates when every active guest staying that night has one and the night has no undated rooms (entered counts, other reservations); otherwise from the latest snapshot on or before that day. A cancelled guest without a cancel date is left out. Events without blocks keep the Specifications page fallback.

## Reports

- **Hotel Information** (`/events/[id]/reports/hotel-info`, shareable) — guest-facing booking details; never pickup or contract money. Filtered by guest type (`?guestTypes=`); share links saved before the block-type split keep their filter through `hotelInfoGuestTypes`.
- **/hotels/reports** — pickup history across events (vs attendance and membership, per hotel) and monitoring of upcoming blocks.

## Importing Hotel-Manager

`scripts/import-hotel-manager.ts` (header comment has the full mapping). Dry run by default; `--apply` commits and copies documents. Refuses to import twice into one tenant.

Production (docker-peter), after this code is deployed:

1. Back up Event-Manager: `docker exec event-manager-db pg_dump -U postgres -d event_manager -Fc > em-pre-hotels.dump` (verify per PugNet `docker-fleet/postgres-18-migration.md`).
2. Confirm names: `docker volume ls | grep -E 'hotel-manager_uploads|uploads_data'`, `docker network ls | grep -E 'hotel-manager|event-manager'`.
3. Run the importer from the app image, attached to both stacks' networks:

   ```sh
   docker create --name hm-import --network event-manager_default \
     -v hotel-manager_uploads:/hm-uploads:ro -v event-manager_uploads_data:/data/uploads \
     -e DATABASE_URL='postgresql://postgres:…@event-manager-db:5432/event_manager' \
     -e HM_DATABASE_URL='postgresql://hotel:…@hotel-manager-db-1:5432/hotel_manager' \
     -e HM_UPLOADS_DIR=/hm-uploads -e UPLOAD_DIR=/data/uploads \
     ghcr.io/ki4hrg/event-manager:main npx tsx scripts/import-hotel-manager.ts --tenant <slug> --user <email>
   docker network connect hotel-manager_default hm-import
   docker start -a hm-import   # dry run: review the match table
   docker rm hm-import
   ```

   Repeat with `--apply` appended once the dry run reads right.
4. In the app: mark each event's HQ hotel on its block; grant `HOTELS` to any custom (non-system) roles.
