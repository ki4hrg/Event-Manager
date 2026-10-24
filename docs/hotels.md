# Hotels module

Ported from Hotel-Manager. Sleeping-room blocks for an event, from proposal to post-event pickup.

## Model

| Concept | Where |
|---|---|
| Hotel | A `Venue` with `isLodging` (+ `brand`, `area` option labels). `/hotels` lists them. |
| Block type | Two fields on `HotelProposal` (and `RfpHotelBlock`): `contractType` (fixed enum: `CONTRACT` carries attrition, `COURTESY` is held without it) and `guestType` (a `hotel_guest_type` option label — Attendees, Staff, Speakers, Exhibitors, VIP). Shown together by `blockTypeLabel` ("Contract · Staff"). Staff is a guest type, never a contract type. |
| Room grid | `RoomGridEditor` (proposals, RFP blocks): each night has a Total; typed room types are counts within it and Run of House is the remainder (never entered, so typed rooms can't exceed the total — saving is blocked when they do). Zeros are stored as 0. |
| Run of House | A room type: a night whose `roomType` is null (`RUN_OF_HOUSE` / `roomTypeLabel` in `src/lib/hotels.ts`). It can sit beside typed rooms in one grid ("Run of House 40 + Suite 5"). There is no block-level flag. |
| Proposal | `HotelProposal` — one hotel's offer for one event: status (a `proposal_status` option whose `group` is the stage REQUESTED / PENDING / ACCEPTED / DECLINED), room grid (`HotelProposalNight`: room type × night → rooms, rate), charges, function space, F&B terms, amenity statuses, terms, documents (`FileUpload.hotelProposalId`). |
| Proposal function space & F&B | Answers to what the RFP asks, kept apart from guest charges. `HotelProposalSpace` rows: one per RFP meeting space request (`spaceRequestId`, kind MEETING; room offered, capacity, 24-hr hold, rental + scope, what waives the rental — `waiverType` F&B spend / room nights / other, `waiverAmount`, `waiverScope` per day / night / stay — and a note) and rooms offered unasked (no request; `name` also keeps a request's name if the request goes). `HotelCharge.kind` is GUEST (resort fee, parking, breakfast) or MEETING (AV, a rental quoted without a room); blocks copy guest charges only. F&B: `fbMinimum` + `fbMinimumScope` (per day / per stay) + `fbMinimumNote` (an event-wide minimum — a spend that waives one room's rental is that room's waiver; neither is `guaranteedRevenue`, the whole agreement's commitment), `fbTaxRate`, `fbServiceCharge`, and `HotelProposalMeal` (average per-person price per meal type: the RFP's F&B names, as its response form lists them). Shared shapes and labels in `src/lib/rfp/proposalSpace.ts`. |
| Amenities | `Venue.amenities` — the hotel's profile: fixed parts of what it has or provides to every guest (airport shuttle, on-site restaurant, valet parking, complimentary breakfast), as `hotel_amenity` labels. Edited in the venue form; `/hotels` filters on them (`?amenity=`, every one) and an RFP's requested amenities filter its *Add hotel* picker. |
| Lead source | Where a proposal's lead came from: **Direct** (`leadSourceDirect`), or an organization — a vendor tagged `LEAD_SOURCE` in `Vendor.models` (a CVB, a third-party planner; the *Also: Lead source* box on the vendor form) — with one of its contacts (`leadSourceVendorId`, `leadSourceContactId`). A lead-source-only vendor isn't general-purpose, so it stays out of order pickers. The offer reader picks a candidate lead source that sent, forwarded or is copied on the offer. Replaced the `hotel_lead_source` option list (migrated to vendors). |
| Proposal amenities | `HotelProposalAmenity` — only what the offer states, against the profile: **Confirmed** (it commits to one — leverage if it later isn't there) or **Unavailable** (not for this event), with a note. Unstated amenities are the profile's word alone. A confirmed one the profile lacks shows *Add to hotel* (VENUES WRITE). Statuses are in each revision's snapshot, so Confirmed → Unavailable shows in the history. The comparison and Hotel Information use profile + confirmed − unavailable. |
| Concessions | What's given or negotiated for the group (comp rooms, a reduced valet rate, meal vouchers), from the `rfp_concession` list (titled *Concessions* in settings). They live only in the RFP (requested) and the proposal (answers, plus ones offered unasked). One service can be both: valet parking is an amenity, a reduced valet rate a concession. A requested concession whose label matches a profile amenity (Complimentary Breakfast) starts Met on a new proposal — in the form and through `record_rfp_response` alike (`coveredByProfile`) — unless the offer says that amenity is unavailable. |
| APEX alignment | The APEX Single Facility RFP keeps three things apart, and so do we: the facility's **Site Profile** (what it has → `Venue.amenities`), its **price lists** (resort fee, parking, valet, internet, porterage → proposal charges, `HotelCharge`), and **Concessions Desired / Offered** under Guest rooms / Food & beverage / Other (→ `rfp_concession`, whose `group` is that heading). So Wi-Fi or breakfast free for every guest is an amenity; the same thing given to this group, or waived from the price list, is a concession, and an RFP asking for it reads as Met when the profile already covers it. |
| Controlled labels | Amenity and concession labels come only from their lists (`requireListLabels` in `src/lib/hotelLabels.ts`; labels a record already holds may stay until mapped). Settings refuses a label that differs from another only by case or spacing (`labelKey`), can **merge** one option into another (every use moves; `mergeHotelLabel`), and lists labels in use that aren't on the list for mapping or adding. |
| Revisions | `HotelProposalVersion` — every save refreshes the current revision's snapshot; raising `revision` freezes the previous one and records a field diff, including amenity statuses and concession answers ("Concession: Comp rooms — Met → Partial"). Snapshots from before concessions were versioned don't diff on them. A revised offer emailed to the event inbox applies as the next revision (see email-ingest). |
| Block | `HotelBlock` — an accepted proposal turned into the booked block (1:1). Nights keep `contractedRooms` (as signed) next to `rooms` (current / final) and `otherReservations`. |
| Pickup | `HotelPickupGuest` (hotel's guest list; merge by confirmation # is scoped to the block), `HotelPickupCount` (entered nightly totals), `HotelPickupImport` (history). |
| Booking dates | `HotelPickupGuest.bookedOn` / `cancelledOn`, when the hotel's report has them (mapped in the CSV wizard; settable per guest via MCP `update_hotel_pickup_guest`). A merge never clears a known date; before the block starts, a guest new in a merge (or newly cancelled) without a date gets the import day. |
| Snapshots | `HotelPickupSnapshot` — pickup per night as of a day, written on every pickup change. |

Pickup is computed, never stored per night: `src/lib/hotelPickup.ts` is the single calculation (guests staying that night + entered counts + other reservations). Guests keep the room type they actually had. A guest or count lands on its own room type when the block names it; any other type pools into the block's Run of House allotment, or counts outside the block when it has none. Attrition: a block is "at risk" when pickup % < 100 − allowed attrition.

## RFPs

What we ask hotels for, before any proposal comes back. `Rfp` (generic, `kind = HOTEL`) with requested `RfpHotelBlock`s — one per contract type + guest type, each a night × room type grid of requested rooms plus a target rate (a ceiling when marked required, printed "must be no more than"; otherwise a target) — and `RfpConcession`s (labels from the `rfp_concession` option list, free-text values, required or not).

- **Editor** — `/events/[id]/hotels/rfps/[rfpId]`: details (requested arrival / departure, peak rooms, alternate dates, decision timeline and decision maker — a contact or typed —, hotel regions / areas (`Rfp.regions` / `Rfp.areas`, else the event's `Event.regions` / `Event.areas`, set in event settings; `inScope` in `src/lib/areas.ts` filters the *Add hotel* picker, and they print as the APEX location), event history scope (`historyMatching`: only past blocks of this RFP's contract / guest types), reservation method, F&B minimum, requested amenities) and document parts; blocks (shared `RoomGridEditor`; a new block's nights are the RFP's arrival–departure filled with peak rooms, and each block can add or drop edge days); function space and F&B as two cards of `RfpSpaceRequest` rows (`RfpSpaceEditor`, saved per kind): entered by hand, or copied in with *Add from functions* / *Add from catering orders* (`functionSpaceRows` / `cateringSpaceRows` in `src/lib/rfp/space.ts`); items not scheduled yet come through with no day ("Day TBD"); a row can repeat daily through an `endDay` (identical daily times fold into one row on copy; one schedule spanning days becomes a through-row with a 24-hr hold), and the document prints it once per day; concessions (picked from `rfp_concession`, whose option `group` — ROOMS / FB / OTHER — is the APEX "Concessions Desired" heading). *Fill from history* fills a block from past pickup, filtered by contract type and guest type (the block's own by default, or any) (`patternStats` / `proposedRoles` / `proposeNights` in `src/lib/hotelPattern.ts`); the pattern report's *Use in RFP* starts a new RFP the same way.
- **Document** — `src/lib/rfp/document.ts` builds one `RfpDocument` in APEX Single Facility RFP order (`docs/apex/APEX_Single_Facility_RFP.pdf`): I contact information; II event profile (from the ESG §A / §D when filled in) and event history; III requirements — statement of need, preferred and alternate dates, a derived facility summary (room nights, peak night, largest function, rooms at once), guest room blocks (night × room type, as on the APEX and hotel forms), function space and F&B by day, requested amenities, concessions by heading, other requirements; IV proposal specifications and attachments; V a blank response form. Blocks, function space, F&B, concessions, history, other requirements and the response form are optional (`Rfp.sections`). Rendered by `RfpDocumentView` (`/print`) and `src/lib/rfp/renderDocx.ts` (`/api/events/[id]/rfps/[rfpId]?format=docx`).
- **Recipients** — `RfpRecipient` per hotel: sent date, declined to bid. State is derived (`recipientState` in `src/lib/rfp/recipients.ts`): not sent / due in n days / overdue / declined / responded. *Record response* opens a new proposal prefilled from the requested block (`?rfpBlockId=`); creating it links `HotelProposal.rfpId` / `rfpBlockId` and adds the hotel as a recipient if it wasn't listed. A saved proposal can be linked, moved to another block or RFP, or unlinked from its *Source* picker (or `update_hotel_proposal`'s `rfpBlockId`); leaving an RFP drops the answers to its concessions and space requests, keeping the rooms as offered unasked. Blocks are saved in place by id so those links survive edits. The *Add hotel* picker offers hotels in the RFP's areas that have every requested amenity; *Show all hotels* lists the rest with what they lack.
- **Concession answers** — a proposal answering an RFP records, per requested concession, Met / Partial / Not met plus what was offered (`HotelProposalConcession` with `concessionId`). Any proposal, RFP or not, also lists concessions the hotel offered unasked (`HotelProposalConcession` with `label`, no `met`; a check constraint keeps a row one or the other), shown as *Also offered* in the comparison. RFP concessions are saved in place by id; removing one drops its answers. Both kinds are in each revision's snapshot, by label.
- **Bid comparison** — `/events/[id]/hotels/rfps/[rfpId]/compare` (+ `/print`, `?doc=compare` .docx): one group per requested block, a column per hotel — room nights and peak vs requested, average rate vs target, room revenue, attrition, guest charges, each meeting space request's room (unanswered flagged), other rooms offered, meeting space charges, F&B minimum (vs the RFP's), F&B tax & service, each requested meal type's price, amenities (missing requested ones flagged), each concession, each night with shortfall. Built by `buildComparison` / `comparisonRows` (`src/lib/rfp/compare.ts`), shared by the page and the .docx.
- **Response form** — "Concessions offered" lists every APEX heading (Guest rooms, Food & beverage, Other) with the concessions asked for under it plus blank rows for ones the hotel offers unasked (`concessionOfferRows`).
- **Issue** — files the rendered .docx on the RFP (`file_type` "RFP"), stamps `issuedOn`, moves Draft → Issued, and marks every recipient not yet sent (and not declined) as sent that day.
- Not shareable: RFPs go out as files.
- **MCP** — `src/lib/mcpTools/rfps.ts`: `list_rfps` / `get_rfp`, `create_rfp` / `update_rfp` / `delete_rfp`, `set_rfp_blocks` / `set_rfp_concessions` / `set_rfp_space_requests` (pass existing ids to keep links), `add_rfp_recipients` / `update_rfp_recipient` / `remove_rfp_recipient`, `record_rfp_response` (a proposal seeded from the requested block), `get_rfp_comparison`. `update_hotel_proposal` takes concession answers. Issuing the .docx stays in the app.

## ESG / PER

`loadHousingInput` (`src/lib/esg/housing.ts`) reports an event's blocks with `source: "hotels"`: ESG §G room blocks by night (final rooms), PER §III hotel count and peak night (actual pickup), PER §IV per hotel contracted / final / pickup at 90, 60, 30, 21, 14, 7 days before the first night / actual. A days-out cell comes from booking dates when every active guest staying that night has one and the night has no undated rooms (entered counts, other reservations); otherwise from the latest snapshot on or before that day. A cancelled guest without a cancel date is left out. Events without blocks keep the Specifications page fallback.

§W (Billing) shows *Hotel concessions* (`loadHotelConcessions`, `src/lib/esg/hotelConcessions.ts`): per accepted proposal (or one with a block), the requested concessions met or partly met and those offered unasked, above the editable "Special concessions" field.

## Reports

- **Hotel Information** (`/events/[id]/reports/hotel-info`, shareable) — guest-facing booking details; never pickup or contract money. Filtered by guest type (`?guestTypes=`); share links saved before the block-type split keep their filter through `hotelInfoGuestTypes`.
- **/hotels/reports** — pickup history across events (vs attendance and membership, per hotel) and monitoring of upcoming blocks.

## Pages

- **Hotels** (`/events/[id]/hotels`) — lifecycle order: RFPs (a count and a link; the event's RFPs page, `?kind=HOTEL`, is their one list), Proposals (`#proposals`), Blocks (`#blocks`). Header links to Hotel Information and the Inbox.
- **Proposal** / **Block** detail — titled "Proposal · hotel" / "Block · hotel", breadcrumbs through *Proposals* / *Blocks* to those anchors, cross-linked (View RFP, View block, View proposal). Both cards autosave (`useAutosave`; `updateHotelProposal` / `updateHotelBlock` don't redirect, and the block save returns its nights' ids so rows it just added update in place). Read-only users get the same card disabled. Creating a proposal still submits; a revision applied from the Inbox submits too (*Apply Revision*).
- **Pickup** — the block page lists the first 500 guests; `?guests=all` lifts the cap (the pickup math always counts every guest).

## Email inbox

Each event can have an inbox address (event Settings › Inbox). Hotels' pickup
reports sent or forwarded there are read by Claude, which proposes the import:
open the item under the event's **Inbox**, check the block and the mapping,
and press Import (or Save counts). It goes through the same cores as the
pickup page (`importPickupGuestsCore` MERGE / APPEND / REPLACE,
`savePickupCountsCore`), so history and snapshots are the same. Design and
setup: `docs/proposals/email-ingest.md`, `workers/email-inbound/README.md`.

Files saved from an online tool (a proposal as PDF, a pickup sheet) can be
dropped on the event's Inbox page instead of emailed: they post to
`/api/events/[id]/inbox/upload` (multipart) and become one item with origin
`UPLOAD`, read like delivered mail (`submitInboundItemCore`, shared with MCP
`submit_inbox_item`).

Permissions: the inbox holds every kind of mail, not just hotels'. Reading it
is EVENTS VIEW (the org-wide `/inbox` and the header count cover events the
user can see, `orgInboxWhere` → `eventScopeWhere`); triage — release, re-read,
dismiss, restore, move, upload/submit — is EVENTS WRITE. Applying needs WRITE
on what it changes: HOTELS for pickup, hotel proposals and declines; the RFP
kind's resource (`quoteResource`; EVENTS when standalone) for a vendor quote;
CATERING_ORDERS for a BEO; the covered record's (`contractTargetResource`) for
a contract. Each review only offers what the reviewer may write.

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
