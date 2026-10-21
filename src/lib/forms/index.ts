// Form-type registry. Each FormType's module (./types FormModule) owns its
// projection, parsing, diff and apply; the public surface and the review
// queue only ever go through formModule(). Server-only.

import type { FormType } from "@prisma/client";
import { functionReviewModule } from "./functionReview";
import { itemRequestModule } from "./itemRequest";
import { exhibitRequestModule } from "./exhibitRequest";
import { presentationDeliverablesModule } from "./presentationDeliverables";
import { speakerProfileModule } from "./speakerProfile";
import { readFormLinkConfig, type FormLinkConfig } from "./meta";
import type { FormLinkTarget, FormModule } from "./types";

export function formModule(formType: FormType): FormModule<unknown, unknown> {
  switch (formType) {
    case "FUNCTION_REVIEW":
      return functionReviewModule as FormModule<unknown, unknown>;
    case "ITEM_REQUEST":
      return itemRequestModule as FormModule<unknown, unknown>;
    case "EXHIBIT_REQUEST":
      return exhibitRequestModule as FormModule<unknown, unknown>;
    case "PRESENTATION_DELIVERABLES":
      return presentationDeliverablesModule as FormModule<unknown, unknown>;
    case "SPEAKER_PROFILE":
      return speakerProfileModule as FormModule<unknown, unknown>;
    default: {
      const _exhaustive: never = formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}

export function formConfig(link: Pick<FormLinkTarget, "formType" | "config">): FormLinkConfig {
  return readFormLinkConfig(link.config, formModule(link.formType).sectionKeys);
}

export function loadFormSnapshot(link: FormLinkTarget) {
  return formModule(link.formType).snapshot(link);
}
