// A hotel block's workflow: RFP → Proposal → Block → Guest list → Final
// review. Only the RFP is shared between hotels; from the proposal on, the
// chain is one hotel's, and from the block on, one block's. A proposal page
// sums its blocks. Pure; the strip (HotelWorkflow) and the Blocks list read it.

import type { RfpStatus } from "@prisma/client";
import { dateKey, formatDateKey, type ProposalStage } from "@/lib/hotels";

export type WorkflowStepKey = "RFP" | "PROPOSAL" | "BLOCK" | "GUESTS" | "REVIEW";
export type WorkflowStatus = "done" | "active" | "todo" | "skipped" | "stopped";
export type WorkflowStep = { key: WorkflowStepKey; label: string; state: string; status: WorkflowStatus; href: string | null };

export type WorkflowBlock = {
  id: string;
  contractedOn: Date | null;
  cutoffDate: Date | null;
  checkOut: Date | null;
  reviewedOn: Date | null;
  finalListLoadedAt: Date | null;
  pickedUp: number;
  blocked: number;
};

export type WorkflowInput = {
  eventId: string;
  rfp: { id: string; status: RfpStatus } | null;
  proposal: { id: string; status: string; stage: ProposalStage | null; revision: number };
  blocks: WorkflowBlock[]; // one on a block's pages; all the proposal's on its page
  today: string; // YYYY-MM-DD, event timezone
  eventEnd: string | null; // the event's last day, when a block has no check-out
};

const RFP_STATE: Record<RfpStatus, string> = { DRAFT: "Draft", ISSUED: "Issued", CLOSED: "Closed" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The stay is over once its check-out day (or the event's end) has come.
function stayOver(b: WorkflowBlock, input: Pick<WorkflowInput, "today" | "eventEnd">) {
  const end = b.checkOut ? dateKey(b.checkOut) : input.eventEnd;
  return end != null && input.today >= end;
}

function guestState(b: WorkflowBlock, today: string) {
  const pickup = `${b.pickedUp}/${b.blocked} room nights${b.blocked ? ` · ${Math.round((b.pickedUp / b.blocked) * 100)}%` : ""}`;
  if (!b.cutoffDate) return pickup;
  const cutoff = dateKey(b.cutoffDate);
  return `${pickup} · cut-off ${cutoff > today ? formatDateKey(cutoff) : "passed"}`;
}

function reviewState(b: WorkflowBlock, over: boolean) {
  if (b.reviewedOn) return `Reviewed ${formatDateKey(dateKey(b.reviewedOn))}`;
  if (!over) return "After the stay";
  return b.finalListLoadedAt ? "Final list loaded" : "Due";
}

// One block's stage, for the Blocks list: the first step not yet done.
export function blockStage(b: WorkflowBlock, input: Pick<WorkflowInput, "today" | "eventEnd">): { key: WorkflowStepKey; label: string } {
  const over = stayOver(b, input);
  if (b.reviewedOn) return { key: "REVIEW", label: reviewState(b, over) };
  if (over) return { key: "REVIEW", label: b.finalListLoadedAt ? "Review: final list loaded" : "Review due" };
  if (!b.contractedOn) return { key: "BLOCK", label: "Contract pending" };
  return { key: "GUESTS", label: "Guest list" };
}

export function workflowSteps(input: WorkflowInput, canWrite: boolean): WorkflowStep[] {
  const { eventId, rfp, proposal, blocks, today } = input;
  const base = `/events/${eventId}/hotels`;
  const one = blocks.length === 1 ? blocks[0] : null;
  const over = blocks.map((b) => stayOver(b, input));

  const steps: Omit<WorkflowStep, "status">[] = [];
  const done: (boolean | "skipped" | "stopped")[] = [];

  steps.push({ key: "RFP", label: "RFP", state: rfp ? RFP_STATE[rfp.status] : "No RFP", href: rfp ? `${base}/rfps/${rfp.id}` : null });
  // Answered for this hotel once its proposal exists.
  done.push(rfp ? true : "skipped");

  steps.push({
    key: "PROPOSAL",
    label: "Proposal",
    state: `${proposal.status}${proposal.revision > 1 ? ` · rev ${proposal.revision}` : ""}`,
    href: `${base}/proposals/${proposal.id}`,
  });
  done.push(proposal.stage === "ACCEPTED" ? true : proposal.stage === "DECLINED" ? "stopped" : false);

  const contracted = blocks.filter((b) => b.contractedOn).length;
  steps.push({
    key: "BLOCK",
    label: "Block",
    state: one
      ? one.contractedOn
        ? `Contracted ${formatDateKey(dateKey(one.contractedOn))}`
        : "Contract pending"
      : blocks.length
        ? `${plural(blocks.length, "block")} · ${contracted} contracted`
        : "Not booked",
    href: one ? `${base}/blocks/${one.id}` : null,
  });
  done.push(blocks.length > 0 && contracted === blocks.length);

  const pickedUp = blocks.reduce((s, b) => s + b.pickedUp, 0);
  const blocked = blocks.reduce((s, b) => s + b.blocked, 0);
  steps.push({
    key: "GUESTS",
    label: "Guest list",
    state: one ? guestState(one, today) : blocks.length ? `${pickedUp}/${blocked} room nights` : "—",
    href: one ? (canWrite ? `${base}/blocks/${one.id}/pickup` : `${base}/blocks/${one.id}`) : null,
  });
  done.push(blocks.length > 0 && over.every(Boolean));

  const reviewed = blocks.filter((b) => b.reviewedOn).length;
  steps.push({
    key: "REVIEW",
    label: "Final review",
    state: one ? reviewState(one, over[0]) : blocks.length ? `${reviewed} of ${blocks.length} reviewed` : "—",
    href: one ? `${base}/blocks/${one.id}/review` : null,
  });
  done.push(blocks.length > 0 && reviewed === blocks.length);

  // The first step not done is the active one; a declined proposal stops the chain.
  let reached = false;
  let stopped = false;
  return steps.map((s, i) => {
    const d = done[i];
    let status: WorkflowStatus;
    if (stopped) status = "todo";
    else if (d === "stopped") {
      status = "stopped";
      stopped = true;
    } else if (d === "skipped") status = "skipped";
    else if (d) status = "done";
    else if (!reached) {
      status = "active";
      reached = true;
    } else status = "todo";
    return { ...s, status };
  });
}
