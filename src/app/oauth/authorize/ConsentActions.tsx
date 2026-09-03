"use client";

import { useFormStatus } from "react-dom";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

// Approve / Deny buttons for the OAuth consent screen. Two separate <form>s so
// each posts to its own Server Action — useFormStatus only reports on the form
// it sits inside, so the pending state stays per-button.

type Props = {
  approveAction: (formData: FormData) => Promise<void>;
  denyAction: (formData: FormData) => Promise<void>;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
};

function SubmitButton({
  className,
  label,
  pendingLabel,
}: {
  className: string;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} w-full disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function HiddenFields(props: Omit<Props, "approveAction" | "denyAction">) {
  return (
    <>
      <input type="hidden" name="client_id" value={props.clientId} />
      <input type="hidden" name="redirect_uri" value={props.redirectUri} />
      <input type="hidden" name="code_challenge" value={props.codeChallenge} />
      <input
        type="hidden"
        name="code_challenge_method"
        value={props.codeChallengeMethod}
      />
      <input type="hidden" name="state" value={props.state} />
      <input type="hidden" name="scope" value={props.scope} />
    </>
  );
}

export function ConsentActions({ approveAction, denyAction, ...fields }: Props) {
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-3">
      <form action={denyAction} className="sm:flex-1">
        <HiddenFields {...fields} />
        <SubmitButton
          className={btnSecondary}
          label="Deny"
          pendingLabel="Denying..."
        />
      </form>
      <form action={approveAction} className="sm:flex-1">
        <HiddenFields {...fields} />
        <SubmitButton
          className={btnPrimary}
          label="Allow access"
          pendingLabel="Connecting..."
        />
      </form>
    </div>
  );
}
