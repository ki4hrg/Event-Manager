import Link from "next/link";
import type { ReactNode } from "react";
import { formatEventDate } from "@/lib/agendaUtils";
import { formatPhone } from "@/lib/format-phone";
import type { EsgDerivedDef, EsgDerivedSource } from "@/lib/esg/fields";
import type { EsgNarrativeData } from "@/lib/esg/narrativeData";
import { FbAttendanceTable } from "./FbAttendanceTable";

// Read-only blocks for ESG fields the app already knows. Each links to where
// the data is edited.

function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
      {label}
    </Link>
  );
}

function Block({ def, edit, children }: { def: EsgDerivedDef; edit?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {def.label}
          {def.required && <span className="text-red-500 dark:text-red-400"> *</span>}
        </h3>
        {edit}
      </div>
      <div className="mt-1 text-sm text-gray-900 dark:text-white">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gray-400 dark:text-gray-500">{children}</p>;
}

function personName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}

function ContactCard({
  name,
  lines,
  badges,
}: {
  name: string;
  lines: (string | null | undefined)[];
  badges?: string[];
}) {
  return (
    <li className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg min-w-0 break-words">
      <p className="font-medium text-gray-900 dark:text-white">{name}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="text-gray-600 dark:text-gray-400">
          {l}
        </p>
      ))}
      {badges && badges.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {badges.map((b) => (
            <span key={b} className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {b}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export function SpecDerivedBlock({ def, data }: { def: EsgDerivedDef; data: EsgNarrativeData }) {
  const { event } = data;
  const eventId = event.id;
  const settingsHref = `/events/${eventId}/settings`;
  const keyStaffHref = `/events/${eventId}#key-staff`;
  const source: EsgDerivedSource = def.source;

  switch (source) {
    case "eventName":
      return (
        <Block def={def} edit={<EditLink href={settingsHref} label="Event settings →" />}>
          {event.name}
        </Block>
      );
    case "eventDates":
      return (
        <Block def={def} edit={<EditLink href={settingsHref} label="Event settings →" />}>
          {formatEventDate(event.startDate, event.timezone)} – {formatEventDate(event.endDate, event.timezone)}
        </Block>
      );
    case "primaryFacility": {
      const [primary, ...others] = event.venues.map((v) => v.venue);
      return (
        <Block def={def} edit={<EditLink href={settingsHref} label="Event venues →" />}>
          {primary ? (
            <>
              {primary.name}
              {(primary.city || primary.state || primary.country) && (
                <span className="text-gray-500 dark:text-gray-400">
                  {" "}
                  · {[primary.city, primary.state, primary.country].filter(Boolean).join(", ")}
                </span>
              )}
              {others.length > 0 && (
                <p className="text-gray-500 dark:text-gray-400">Also: {others.map((v) => v.name).join(", ")}</p>
              )}
            </>
          ) : (
            <Empty>No venue on this event.</Empty>
          )}
        </Block>
      );
    }
    case "expectedAttendance":
      return (
        <Block def={def} edit={<EditLink href={settingsHref} label="Event settings →" />}>
          {event.expectedAttendance ?? <Empty>Not set</Empty>}
          {event.expectedAttendance !== null && event.isMembershipBased && event.membershipCount ? (
            <span className="text-gray-500 dark:text-gray-400">
              {" "}
              ({Math.round((event.expectedAttendance / event.membershipCount) * 100)}% of membership)
            </span>
          ) : null}
        </Block>
      );
    case "membership":
      return (
        <Block def={def} edit={<EditLink href={settingsHref} label="Event settings →" />}>
          {event.isMembershipBased ? (event.membershipCount ?? <Empty>Not set</Empty>) : <Empty>Not a membership-based event</Empty>}
        </Block>
      );
    case "keyContacts":
      return (
        <Block def={def} edit={<EditLink href={keyStaffHref} label="Key staff →" />}>
          {data.keyStaff.length === 0 ? (
            <Empty>No key staff on this event.</Empty>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.keyStaff.map((k) => (
                <ContactCard
                  key={k.id}
                  name={personName(k.contact)}
                  lines={[
                    [k.title, k.contact.organization].filter(Boolean).join(" · "),
                    k.responsibilities,
                    [k.contact.phone ? formatPhone(k.contact.phone) : null, k.contact.email].filter(Boolean).join(" · "),
                  ]}
                  badges={[
                    ...(k.onSite === true ? ["On-site"] : k.onSite === false ? ["Off-site"] : []),
                    ...(k.isEmergencyContact ? ["Emergency contact"] : []),
                  ]}
                />
              ))}
            </ul>
          )}
        </Block>
      );
    case "supplierContacts":
      return (
        <Block def={def} edit={<EditLink href={`/events/${eventId}/vendors`} label="Event vendors →" />}>
          {data.supplierContacts.length === 0 ? (
            <Empty>No vendor or venue contacts yet.</Empty>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.supplierContacts.map((s) => (
                <ContactCard
                  key={s.key}
                  name={personName(s.contact)}
                  lines={[
                    [s.role, s.company].filter(Boolean).join(" · "),
                    [s.contact.phone ? formatPhone(s.contact.phone) : null, s.contact.email].filter(Boolean).join(" · "),
                  ]}
                />
              ))}
            </ul>
          )}
        </Block>
      );
    case "emergencyContact": {
      const people = data.keyStaff.filter((k) => k.isEmergencyContact);
      return (
        <Block def={def} edit={<EditLink href={keyStaffHref} label="Key staff →" />}>
          {people.length === 0 ? (
            <Empty>Mark a key staff member as the emergency / crisis contact.</Empty>
          ) : (
            people
              .map((k) =>
                [personName(k.contact), k.contact.phone ? formatPhone(k.contact.phone) : null].filter(Boolean).join(" · "),
              )
              .join("; ")
          )}
        </Block>
      );
    }
    case "fbAttendance":
      return (
        <Block def={def} edit={<EditLink href={`/events/${eventId}/catering-orders`} label="Catering orders →" />}>
          <FbAttendanceTable grid={data.fbGrid} timezone={event.timezone} eventId={eventId} />
        </Block>
      );
    case "signatories":
      return (
        <Block def={def} edit={<EditLink href={keyStaffHref} label="Key staff →" />}>
          {data.signatories.length === 0 ? (
            <Empty>Give a key staff member an approval authority to list them here.</Empty>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.signatories.map((k) => (
                <ContactCard
                  key={k.id}
                  name={personName(k.contact)}
                  lines={[k.title, `Approval authority: ${k.approvalAuthority}`]}
                />
              ))}
            </ul>
          )}
        </Block>
      );
    case "housingBlocks":
      return (
        <Block def={def} edit={<EditLink href={`/events/${eventId}/hotels`} label="Hotels →" />}>
          {data.housing.roomBlocks.length === 0 ? (
            <Empty>No room blocks.</Empty>
          ) : (
            <ul className="space-y-1">
              {data.housing.roomBlocks.map((b) => (
                <li key={b.facilityName}>
                  {b.facilityName}
                  {b.isHq ? " (HQ)" : ""}
                </li>
              ))}
            </ul>
          )}
        </Block>
      );
    case "exhibitBooths":
      return (
        <Block def={def} edit={<EditLink href={`/events/${eventId}/exhibits`} label="Exhibits →" />}>
          {data.boothCount === 0 ? <Empty>No booths yet.</Empty> : `${data.boothCount} booth(s)`}
        </Block>
      );
    default: {
      const _exhaustive: never = source;
      throw new Error(`Unhandled derived source: ${_exhaustive}`);
    }
  }
}
