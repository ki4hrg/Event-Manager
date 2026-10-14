# Hotels module

Ported from Hotel-Manager. Sleeping-room blocks for an event, from proposal to post-event pickup.

## Model

| Concept | Where |
|---|---|
| Hotel | A `Venue` with `isLodging` (+ `brand`, `area` option labels). `/hotels` lists them. |
| Proposal | `HotelProposal` — one hotel's offer for one event: status (a `proposal_status` option whose `group` is the stage REQUESTED / PENDING / ACCEPTED / DECLINED), room grid (`HotelProposalNight`: room type × night → rooms, rate), charges, amenities, terms, documents (`FileUpload.hotelProposalId`). |
| Revisions | `HotelProposalVersion` — every save refreshes the current revision's snapshot; raising `revision` freezes the previous one and records a field diff. |
| Block | `HotelBlock` — an accepted proposal turned into the booked block (1:1). Nights keep `contractedRooms` (as signed) next to `rooms` (current / final) and `otherReservations`. |
| Pickup | `HotelPickupGuest` (hotel's guest list; merge by confirmation # is scoped to the block), `HotelPickupCount` (entered nightly totals), `HotelPickupImport` (history). |
| Booking dates | `HotelPickupGuest.bookedOn` / `cancelledOn`, when the hotel's report has them (mapped in the CSV wizard; settable per guest via MCP `update_hotel_pickup_guest`). A merge never clears a known date; before the block starts, a guest new in a merge (or newly cancelled) without a date gets the import day. |
| Snapshots | `HotelPickupSnapshot` — pickup per night as of a day, written on every pickup change. |

Pickup is computed, never stored per night: `src/lib/hotelPickup.ts` is the single calculation (guests staying that night + entered counts + other reservations; run-of-house pools all types). Attrition: a block is "at risk" when pickup % < 100 − allowed attrition.

## ESG / PER

`loadHousingInput` (`src/lib/esg/housing.ts`) reports an event's blocks with `source: "hotels"`: ESG §G room blocks by night (final rooms), PER §III hotel count and peak night (actual pickup), PER §IV per hotel contracted / final / pickup at 90, 60, 30, 21, 14, 7 days before the first night / actual. A days-out cell comes from booking dates when every active guest staying that night has one and the night has no undated rooms (entered counts, other reservations); otherwise from the latest snapshot on or before that day. A cancelled guest without a cancel date is left out. Events without blocks keep the Specifications page fallback.

## Reports

- **Hotel Information** (`/events/[id]/reports/hotel-info`, shareable) — guest-facing booking details; never pickup or contract money.
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
