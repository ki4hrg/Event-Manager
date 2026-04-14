# Event Manager Tool

## Summary
Internal tool for managing conferences and events, with emphasis on speaker and facility management. Focused on backend processes:

- Contract and vendor management
- Facility/room scheduling
- Speaker logistics (travel, accommodations)
- Catering management
- Audio/video planning

Not attendee-facing; for internal staff use only.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Deployment**: Docker Compose

## Data Models

### Core Entities
- **Event** - Top-level container (a conference or event)
- **Venue** - Physical location containing one or more rooms
- **Room** - Individual bookable space within a venue
- **Function** - Fundamental scheduling unit; represents a room setup/configuration for a time period
- **Contact** - Flexible contact model with roles (Speaker, Venue Contact, Vendor, Staff, Other)

### Function Subtypes
- **Meal/BEO** - Catering function with banquet event order details
- **Breakout Session** - Smaller concurrent sessions
- **Plenary Session** - Main stage/all-attendee sessions

### Key Relationships
- Event has many Functions
- Function belongs to one or more Rooms (combined rooms supported)
- Function has a fixed setup; if location moves, create new Function
- Function can span multiple time slots (e.g., daily staff hospitality room)
- Contacts are assigned to Functions (many-to-many) with role
- Contacts can be linked to Venues (e.g., venue sales contact)
- Meals, Breakouts, and Plenaries extend Function

### Future Entities (not MVP)
- Vendor
- Contract
- Travel Arrangement
- Accommodation

## AV Requirements
Functions include high-level AV needs (projector, screen, microphone, etc.) as checklist/notes. Designed to generate handoff reports for venue/AV providers rather than track inventory.

## Architecture Principles
- Mobile-first responsive design
- Single-tenant (no multi-org access controls for now)
- Modular structure for future extensibility
- Lightweight Docker deployment

## Project Structure
```
/app              # Next.js App Router pages
/components       # React components
  /ui             # Base UI components (buttons, inputs, etc.)
  /features       # Feature-specific components
/lib              # Utilities, helpers
/prisma           # Schema and migrations
/types            # Shared TypeScript types
```

## Commands
```bash
npm run dev       # Start development server
npm run build     # Production build
npm run db:push   # Push schema changes to database
npm run db:studio # Open Prisma Studio
docker compose up # Run full stack in containers
```

## Vendor Model Types

Vendors are tagged with one or more "model types" that indicate which order types they service. This drives vendor picker filtering so users only see relevant vendors.

### Where things live

- **`ModelType` union** — `src/app/vendors/actions.ts` (exported type, line ~210):
  ```ts
  export type ModelType = "CATERING_ORDER" | "AV_ORDER" | "SETUP_ORDER";
  ```
- **Display constants** — `src/app/vendors/model-types.ts` (no `"use server"` directive, importable by client components):
  ```ts
  export const MODEL_TYPES = [
    { value: "CATERING_ORDER", label: "Catering Order" },
    { value: "AV_ORDER", label: "AV Order" },
    { value: "SETUP_ORDER", label: "Setup Order" },
  ] as const;

  export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
    MODEL_TYPES.map(({ value, label }) => [value, label])
  );
  ```
  Always import from this file for display — never re-declare the array or labels inline.

### Filter behavior

`searchAssignedEventVendors(query, eventId, modelType?)` in `src/app/vendors/actions.ts` applies:
```ts
OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }]
```
Vendors with an empty `models` array are treated as general-purpose and appear in every picker regardless of `modelType`.

### Adding a new model type

1. Add the string value to `ModelType` in `src/app/vendors/actions.ts`
2. Add a `{ value, label }` entry to `MODEL_TYPES` in `src/app/vendors/model-types.ts` — `MODEL_LABELS` is derived automatically
3. In the new order type's page/component, pass the new `ModelType` value to `searchAssignedEventVendors`
4. No changes needed to `VendorPanel`, `EventVendorList`, or the filter logic — they handle any `ModelType` generically

## Code Conventions
- Use named exports for components
- Colocate component-specific logic
- Prefer server components; use 'use client' only when needed
- API routes in /app/api following REST conventions
- After creating a new record, redirect to list view (not detail view)
- After updating a record, stay on detail view with success toast
