"use client";

import { LinkedItemsPanel } from "@/components/LinkedItemsPanel";

type LinkedItem = { id: string; label: string; detailPath: string };

type Props = {
  linkedFunctions: LinkedItem[];
  availableFunctions: { id: string; label: string }[];
  linkFunction: (id: string) => Promise<void>;
  unlinkFunction: (id: string) => Promise<void>;
  linkedPresentations: LinkedItem[];
  availablePresentations: { id: string; label: string }[];
  linkPresentation: (id: string) => Promise<void>;
  unlinkPresentation: (id: string) => Promise<void>;
};

export function MediaDeliverableLinkPanel({
  linkedFunctions,
  availableFunctions,
  linkFunction,
  unlinkFunction,
  linkedPresentations,
  availablePresentations,
  linkPresentation,
  unlinkPresentation,
}: Props) {
  return (
    <div className="space-y-6">
      <LinkedItemsPanel
        title="Linked Functions"
        items={linkedFunctions}
        availableItems={availableFunctions}
        emptyMessage="Not linked to any functions."
        linkLabel="Link Existing"
        linkItem={linkFunction}
        unlinkItem={unlinkFunction}
      />
      <LinkedItemsPanel
        title="Linked Presentations"
        items={linkedPresentations}
        availableItems={availablePresentations}
        emptyMessage="Not linked to any presentations."
        linkLabel="Link Existing"
        linkItem={linkPresentation}
        unlinkItem={unlinkPresentation}
      />
    </div>
  );
}
