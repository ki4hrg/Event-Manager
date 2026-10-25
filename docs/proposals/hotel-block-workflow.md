# Hotel block workflow

Status: implemented, revised from this draft. The final review is a guest-list reconciliation; attrition, comps and the hotel's invoice wait for billing (ki4hrg/Event-Manager#53). The workflow is tracked per block. Contract terms (`attritionBasis`, `compRatio`) are on the block. Where this draft and docs/hotels.md differ, docs/hotels.md wins.

## Problem

A hotel block moves through five stages:

**RFP → Proposal → Block → Guest list → Final review**

The first four already exist as separate pages: the RFP editor, the proposal
page, the block page and the pickup page. They link only to their immediate
neighbours. Nothing shows where a block stands in the whole run, or what the
next step is. The fifth stage, the post-event reconciliation with the hotel,
has no home at all. Attrition %, guaranteed revenue, comp rooms, nightly
rates and final pickup are all recorded, but nothing compares them, and
nothing records that the review was done.

## The chain fans out

- One RFP gets many proposals, and several of them can be accepted
  (`Rfp.multiProperty`).
- One accepted proposal can become several blocks (#177).
- A proposal can also arrive with no RFP: direct, or through a CVB lead.

So there's no single linear record. The workflow strip is drawn from
whichever entity the page shows: its upstream link (one RFP, one proposal)
and its downstream links (its blocks).

## 1. Workflow strip

This is a shared server component (`HotelWorkflow`) at the top of the RFP,
proposal, block, pickup and review pages. It has five steps. Each step shows
a one-line state and links to its page; the current page is highlighted.

| Step | State shown | Done when |
|---|---|---|
| RFP | Draft · Issued, n responses · Closed · *No RFP* (skipped) | Closed, or skipped |
| Proposal | Its stage (Requested / Pending / Accepted / Declined), rev n | Accepted |
| Block | Booked · Contracted *date* (`contractedOn`) | `contractedOn` set |
| Guest list | n of m room nights · p% · cut-off in n days / passed | Cut-off passed |
| Final review | Not due · Due (event ended) · Reviewed *date* | Reviewed |

- **Before the chain splits** (the RFP and proposal pages), the downstream
  steps sum across the proposal's blocks, for example "2 blocks · 1 contracted".
- **At 360 px** the strip scrolls sideways (`overflow-x-auto
  whitespace-nowrap`), like the date tabs.

The state is derived in a pure `src/lib/hotelWorkflow.ts` from fields that
already exist, except for the review fields below.

The **Blocks list on `/hotels`** gets a stage column with the same labels.
That makes the list a to-do board: blocks to contract, cut-offs coming up,
reviews due.

## 2. Final review: `/events/[id]/hotels/blocks/[blockId]/review`

This is the post-event reconciliation of one block. It's edit-gated like the
pickup page, and has a print route for sending to the hotel or attaching to
the file.

The page shows these, read-only and computed:

- **Pickup vs contract.** Per night: contracted, final pickup, attrition
  floor, and the shortfall below the floor. This is the `hotelPickup` math
  the block page already uses.
- **Estimated attrition.** Shortfall × that night's rate, on the block's
  attrition basis (question 1).
- **Room revenue.** Actual room revenue against `guaranteedRevenue`.
- **Comp rooms.** Comps earned, against `compRooms` (question 2).
- **Concessions.** The ones the proposal confirmed (Met / Partial), each
  with a *Delivered* yes/no.

The page records:

- **What the hotel billed**: attrition charged, comps credited, rebate or
  commission received (question 3). Each is flagged when it differs from our
  estimate.
- **Notes.**
- **Reviewed on / by.** This completes the step.

Schema: review fields on `HotelBlock`. A `HotelBlockReview` model is
avoided until billing (#53) lands. Concession delivery is a column on
`HotelProposalConcession`, because concessions belong to the proposal.

- **MCP:** `get_hotel_block_review` and `update_hotel_block_review`.
- **PER:** §IV already reports actual pickup. The review doesn't change it.

## Open questions

1. **Attrition basis.** Contracts compute attrition either *cumulatively*
   (total room nights against the floor) or *night by night* (each night on
   its own, so a strong Saturday doesn't cover a weak Thursday).
   Proposal: a per-block setting, defaulting to cumulative.
2. **Comp rooms.** `compRooms` is a count. Do contracts state a ratio
   ("1 per 40 room nights, cumulative") that we should store, so that comps
   earned can be computed from pickup?
3. **What the hotel billed.** Is the audit against the hotel's final
   invoice/folio? Which figures do you reconcile: attrition, comps, rebates,
   resort fees waived, F&B? Some of these overlap billing (#53, not built).
4. **Unit.** Is the review per block (proposed), or per hotel when one
   contract covers several blocks?
