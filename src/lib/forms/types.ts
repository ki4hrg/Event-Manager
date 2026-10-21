// The contract every public form type implements. Server-only shapes; the
// client-safe payload and baseline types live in ./meta.

import type { FormType, Prisma } from "@prisma/client";
import type { FormDiffSection } from "./meta";

// The link fields a module may read. Loaded from the token (public side) or
// from the submission (review side), never from the request.
export type FormLinkTarget = {
  formType: FormType;
  tenantId: string;
  eventId: string;
  functionId: string | null;
  contactId: string | null;
  boothGroupId: string | null;
  config: Prisma.JsonValue;
  event: { name: string; timezone: string | null };
};

// The target ids a new link carries; a module validates the ones it uses.
export type LinkTargetArgs = { eventId: string; functionId: string | null; contactId: string | null; boothGroupId: string | null };

export type FormSnapshot<B> = {
  baseline: B;
  sections: string[];
  // Changes whenever a field the form can write changes. The public form
  // posts back the version it rendered, and the review page posts the version
  // it diffed against; a mismatch on either side is refused.
  version: string;
  targetName: string;
};

// A decision the reviewer makes per section: which contact, which order.
// Posted as choice_<key>.
export type ReviewChoice = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue: string;
};

export type FormApplyContext<P, B> = {
  submission: {
    id: string;
    payload: P;
    baseline: B;
    submitterName: string | null;
    submitterOrg: string | null;
    submittedAt: Date;
  };
  link: FormLinkTarget;
  sections: Set<string>;
  choices: Record<string, string>;
  userId: string;
};

// Where apply wants the submission's files filed; the event's Files when
// unset. `applied` lists the section keys written.
export type FileTarget = { entityType: "event" | "printOrder" | "supplyOrder" | "mediaDeliverable"; entityId: string };

export type FormApplyResult = { applied: string[]; filesTo?: FileTarget } & Record<string, unknown>;

// Method syntax on purpose: parameters stay bivariant, so a module typed for
// its own payload fits the registry's FormModule<unknown, unknown>.
export type FormModule<P, B> = {
  sectionKeys: Set<string>;
  // Open forms take submissions from anyone with the link; staff lists name
  // them by submitter rather than target.
  open: boolean;
  // Validates a new link's target as the creating user. Throws on a foreign
  // or missing target.
  assertTarget(args: LinkTargetArgs, userId: string): Promise<void>;
  snapshot(link: FormLinkTarget): Promise<FormSnapshot<B> | null>;
  parse(formData: FormData, snapshot: FormSnapshot<B>, link: FormLinkTarget): Promise<P>;
  rebase(payload: P, oldBaseline: B | null, newBaseline: B): P;
  diff(baseline: B, payload: P, current: B, sections: string[]): FormDiffSection[];
  reviewChoices(payload: P, link: FormLinkTarget): Promise<ReviewChoice[]>;
  apply(ctx: FormApplyContext<P, B>): Promise<FormApplyResult>;
};
