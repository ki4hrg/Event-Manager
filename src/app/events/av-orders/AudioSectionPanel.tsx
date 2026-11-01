"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";
import type {
  AudioSection,
  InputGroup,
  InputItem,
  MonitorMix,
  MonitorOutput,
  Vendor,
  Contact,
  Equipment,
} from "@prisma/client";
import {
  type ContactOptions,
  mergeExtraVendorsIntoGroup,
  PartyField,
} from "./party-field";
import { partyLabel } from "@/lib/partyLabel";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { GroupedEquipmentSelect } from "@/components/ui/GroupedEquipmentSelect";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";

// ============================================================================
// Types
// ============================================================================

type InputItemFull = InputItem & {
  equipment: Equipment | null;
  providerVendor: Vendor | null;
  providerContact: Contact | null;
  operatorVendor: Vendor | null;
  operatorContact: Contact | null;
};

type InputGroupFull = InputGroup & {
  providerVendor: Vendor | null;
  providerContact: Contact | null;
  operatorVendor: Vendor | null;
  operatorContact: Contact | null;
  inputItems: InputItemFull[];
};

type MonitorOutputFull = MonitorOutput & {
  equipment: Equipment | null;
  providerVendor: Vendor | null;
  providerContact: Contact | null;
  operatorVendor: Vendor | null;
  operatorContact: Contact | null;
};

type MonitorMixFull = MonitorMix & {
  equipment: Equipment | null;
  providerVendor: Vendor | null;
  providerContact: Contact | null;
  operatorVendor: Vendor | null;
  operatorContact: Contact | null;
  monitorOutputs: MonitorOutputFull[];
};

type AudioSectionFull = AudioSection & {
  inputGroups: InputGroupFull[];
  monitorMixes: MonitorMixFull[];
};

type AudioSectionPanelProps = {
  audioSection: AudioSectionFull;
  audioInputOptions: Equipment[];
  audioOutputOptions: Equipment[];
  vendorGroups: ResponsiblePartyOptions;
  contactOptions: ContactOptions;
  updateSection: (formData: FormData) => Promise<void | UserError>;
  createInputGroup: (formData: FormData) => Promise<void | UserError>;
  updateInputGroup: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteInputGroup: (id: string) => Promise<void>;
  createInputItem: (inputGroupId: string, formData: FormData) => Promise<void | UserError>;
  updateInputItem: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteInputItem: (id: string) => Promise<void>;
  createMonitorMix: (formData: FormData) => Promise<void | UserError>;
  updateMonitorMix: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteMonitorMix: (id: string) => Promise<void>;
  createMonitorOutput: (monitorMixId: string, formData: FormData) => Promise<void | UserError>;
  updateMonitorOutput: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteMonitorOutput: (id: string) => Promise<void>;
};

// ============================================================================
// Helpers
// ============================================================================


function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

// ============================================================================
// InputItem row
// ============================================================================

function InputItemRow({
  item,
  audioInputOptions,
  vendorGroups,
  contacts,
  updateItem,
  deleteItem,
}: {
  item: InputItemFull;
  audioInputOptions: Equipment[];
  vendorGroups: ResponsiblePartyOptions;
  contacts: ContactOptions;
  updateItem: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("AV_ORDERS");
  const canDelete = useCanDelete("AV_ORDERS");
  const [editing, setEditing] = useState(false);

  const effectiveVendorGroups = useMemo(
    () => mergeExtraVendorsIntoGroup(vendorGroups, [item.providerVendor, item.operatorVendor]),
    [vendorGroups, item.providerVendor, item.operatorVendor]
  );

  const provider = partyLabel(item.providerVendor, item.providerContact);
  const operator = partyLabel(item.operatorVendor, item.operatorContact);

  return (
    <div className="ml-4 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
      {editing ? (
        <ActionForm
          action={(fd) => updateItem(item.id, fd)}
          onDone={() => setEditing(false)}
          className="space-y-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
              <input
                type="text"
                name="description"
                required
                defaultValue={item.description}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty</label>
              <input
                type="number"
                name="quantity"
                defaultValue={item.quantity}
                min={1}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Input Type</label>
              <GroupedEquipmentSelect name="equipmentId" options={audioInputOptions} defaultValue={item.equipmentId} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
              <PartyField fieldPrefix="provider" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={item.providerVendorId} defaultContactId={item.providerContactId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField fieldPrefix="operator" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={item.operatorVendorId} defaultContactId={item.operatorContactId} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              name="notes"
              defaultValue={item.notes || ""}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <ActionFormError />
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </ActionForm>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm space-y-0.5 min-w-0 break-words">
            <div>
              <span className="font-medium text-gray-900 dark:text-white">{item.description}</span>
              <span className="text-gray-500 dark:text-gray-400"> × {item.quantity}</span>
              {item.equipment && <span className="ml-2 text-gray-500 dark:text-gray-400">({item.equipment.name})</span>}
              {item.notes && <span className="ml-2 text-gray-400 dark:text-gray-500">· {item.notes}</span>}
            </div>
            {(provider || operator) && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {provider && <span>Provider: {provider}</span>}
                {provider && operator && <span className="mx-2">·</span>}
                {operator && <span>Op: {operator}</span>}
              </div>
            )}
          </div>
          <div className="flex gap-2 ml-2 shrink-0">
            {canWrite && (
              <button onClick={() => setEditing(true)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Edit</button>
            )}
            {canDelete && (
              <InlineConfirmButton
                onConfirm={() => deleteItem(item.id)}
                resource="AV_ORDERS"
                requiredLevel="WRITE"
                className="text-red-600 dark:text-red-400 hover:underline text-xs"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// InputGroup card
// ============================================================================

function InputGroupCard({
  group,
  audioInputOptions,
  vendorGroups,
  contacts,
  updateGroup,
  deleteGroup,
  createItem,
  updateItem,
  deleteItem,
}: {
  group: InputGroupFull;
  audioInputOptions: Equipment[];
  vendorGroups: ResponsiblePartyOptions;
  contacts: ContactOptions;
  updateGroup: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteGroup: (id: string) => Promise<void>;
  createItem: (inputGroupId: string, formData: FormData) => Promise<void | UserError>;
  updateItem: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("AV_ORDERS");
  const canDelete = useCanDelete("AV_ORDERS");
  const [editingGroup, setEditingGroup] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  const effectiveVendorGroups = useMemo(
    () => mergeExtraVendorsIntoGroup(vendorGroups, [group.providerVendor, group.operatorVendor]),
    [vendorGroups, group.providerVendor, group.operatorVendor]
  );

  const provider = partyLabel(group.providerVendor, group.providerContact);
  const operator = partyLabel(group.operatorVendor, group.operatorContact);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Group header */}
      {editingGroup ? (
        <ActionForm
          action={(fd) => updateGroup(group.id, fd)}
          onDone={() => setEditingGroup(false)}
          className="p-3 bg-gray-50 dark:bg-gray-900 space-y-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Group Name *</label>
              <input
                type="text"
                name="name"
                required
                defaultValue={group.name}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
              <PartyField fieldPrefix="provider" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={group.providerVendorId} defaultContactId={group.providerContactId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField fieldPrefix="operator" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={group.operatorVendorId} defaultContactId={group.operatorContactId} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              name="notes"
              defaultValue={group.notes || ""}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <ActionFormError />
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditingGroup(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </ActionForm>
      ) : (
        <div className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-900">
          <div className="min-w-0 break-words">
            <span className="font-medium text-gray-900 dark:text-white text-sm">{group.name}</span>
            {provider && <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">Provider: {provider}</span>}
            {operator && <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">Op: {operator}</span>}
            {group.notes && <span className="ml-3 text-xs text-gray-400 dark:text-gray-500">· {group.notes}</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            {canWrite && (
              <button onClick={() => setEditingGroup(true)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Edit</button>
            )}
            {canDelete && (
              <InlineConfirmButton
                onConfirm={() => deleteGroup(group.id)}
                prompt="Its inputs are deleted too."
                resource="AV_ORDERS"
                requiredLevel="WRITE"
                className="text-red-600 dark:text-red-400 hover:underline text-xs"
              />
            )}
          </div>
        </div>
      )}

      {/* Input items */}
      <div className="p-3 space-y-2">
        {group.inputItems.map((item) => (
          <InputItemRow
            key={item.id}
            item={item}
            audioInputOptions={audioInputOptions}
            vendorGroups={effectiveVendorGroups}
            contacts={contacts}
            updateItem={updateItem}
            deleteItem={deleteItem}
          />
        ))}

        {showAddItem ? (
          <ActionForm
            action={(fd) => createItem(group.id, fd)}
            onDone={() => setShowAddItem(false)}
            className="ml-4 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded space-y-2"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
                <input
                  type="text"
                  name="description"
                  required
                  placeholder="e.g., Kick drum"
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty</label>
                <input
                  type="number"
                  name="quantity"
                  defaultValue={1}
                  min={1}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Input Type</label>
                <GroupedEquipmentSelect name="equipmentId" options={audioInputOptions} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <PartyField fieldPrefix="provider" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={group.providerVendorId} defaultContactId={group.providerContactId} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <PartyField fieldPrefix="operator" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={group.operatorVendorId} defaultContactId={group.operatorContactId} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <input
                type="text"
                name="notes"
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <ActionFormError />
            <div className="flex gap-2">
              <SubmitButton label="Add Input" />
              <button type="button" onClick={() => setShowAddItem(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </ActionForm>
        ) : canWrite ? (
          <button
            onClick={() => setShowAddItem(true)}
            className="ml-4 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add Input
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// MonitorOutput row (nested under a mix group)
// ============================================================================

function MonitorOutputRow({
  output,
  audioOutputOptions,
  vendorGroups,
  contacts,
  updateOutput,
  deleteOutput,
}: {
  output: MonitorOutputFull;
  audioOutputOptions: Equipment[];
  vendorGroups: ResponsiblePartyOptions;
  contacts: ContactOptions;
  updateOutput: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteOutput: (id: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("AV_ORDERS");
  const canDelete = useCanDelete("AV_ORDERS");
  const [editing, setEditing] = useState(false);

  const effectiveVendorGroups = useMemo(
    () => mergeExtraVendorsIntoGroup(vendorGroups, [output.providerVendor, output.operatorVendor]),
    [vendorGroups, output.providerVendor, output.operatorVendor]
  );

  const provider = partyLabel(output.providerVendor, output.providerContact);
  const operator = partyLabel(output.operatorVendor, output.operatorContact);

  return (
    <div className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
      {editing ? (
        <ActionForm
          action={(fd) => updateOutput(output.id, fd)}
          onDone={() => setEditing(false)}
          className="space-y-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Output Type</label>
              <GroupedEquipmentSelect name="equipmentId" options={audioOutputOptions} defaultValue={output.equipmentId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty</label>
              <input
                type="number"
                name="quantity"
                min={1}
                defaultValue={output.quantity}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
              <PartyField fieldPrefix="provider" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={output.providerVendorId} defaultContactId={output.providerContactId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField fieldPrefix="operator" vendorGroups={effectiveVendorGroups} contacts={contacts} defaultVendorId={output.operatorVendorId} defaultContactId={output.operatorContactId} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              name="notes"
              defaultValue={output.notes || ""}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <ActionFormError />
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </ActionForm>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="min-w-0 break-words text-gray-900 dark:text-white">
            <span className="text-gray-500 dark:text-gray-400 mr-1">×{output.quantity}</span>
            <span>{output.equipment?.name ?? <span className="italic text-gray-400">No type</span>}</span>
            {provider && <span className="ml-2 text-gray-500 dark:text-gray-400">Provider: {provider}</span>}
            {operator && <span className="ml-2 text-gray-500 dark:text-gray-400">Op: {operator}</span>}
            {output.notes && <span className="ml-2 text-gray-400 dark:text-gray-500">· {output.notes}</span>}
          </div>
          <div className="flex gap-2 ml-2 shrink-0">
            {canWrite && (
              <button onClick={() => setEditing(true)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Edit</button>
            )}
            {canDelete && (
              <InlineConfirmButton
                onConfirm={() => deleteOutput(output.id)}
                resource="AV_ORDERS"
                requiredLevel="WRITE"
                className="text-red-600 dark:text-red-400 hover:underline text-xs"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MonitorMix group card
// ============================================================================

function MonitorMixGroupCard({
  mix,
  audioOutputOptions,
  vendorGroups,
  contacts,
  updateMix,
  deleteMix,
  createOutput,
  updateOutput,
  deleteOutput,
}: {
  mix: MonitorMixFull;
  audioOutputOptions: Equipment[];
  vendorGroups: ResponsiblePartyOptions;
  contacts: ContactOptions;
  updateMix: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteMix: (id: string) => Promise<void>;
  createOutput: (monitorMixId: string, formData: FormData) => Promise<void | UserError>;
  updateOutput: (id: string, formData: FormData) => Promise<void | UserError>;
  deleteOutput: (id: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("AV_ORDERS");
  const canDelete = useCanDelete("AV_ORDERS");
  const [editingGroup, setEditingGroup] = useState(false);
  const [showAddOutput, setShowAddOutput] = useState(false);

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
      {/* Group header */}
      {editingGroup ? (
        <ActionForm
          action={(fd) => updateMix(mix.id, fd)}
          onDone={() => setEditingGroup(false)}
          className="space-y-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Mix Name *</label>
              <input
                type="text"
                name="description"
                required
                defaultValue={mix.description}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <input
                type="text"
                name="notes"
                defaultValue={mix.notes || ""}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <ActionFormError />
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditingGroup(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </ActionForm>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-words font-medium text-sm text-gray-900 dark:text-white">
            {mix.description}
            {mix.notes && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-normal">· {mix.notes}</span>}
          </span>
          <div className="flex gap-2 shrink-0">
            {canWrite && (
              <>
                <button onClick={() => setShowAddOutput(true)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Add Output</button>
                <button onClick={() => setEditingGroup(true)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">Edit</button>
              </>
            )}
            {canDelete && (
              <InlineConfirmButton
                onConfirm={() => deleteMix(mix.id)}
                prompt="Its outputs are deleted too."
                resource="AV_ORDERS"
                requiredLevel="WRITE"
                className="text-red-600 dark:text-red-400 hover:underline text-xs"
              />
            )}
          </div>
        </div>
      )}

      {/* Add output form */}
      {showAddOutput && (
        <ActionForm
          action={(fd) => createOutput(mix.id, fd)}
          onDone={() => setShowAddOutput(false)}
          className="ml-4 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 space-y-2"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Output Type</label>
                <GroupedEquipmentSelect name="equipmentId" options={audioOutputOptions} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty</label>
                <input
                  type="number"
                  name="quantity"
                  min={1}
                  defaultValue={1}
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <PartyField fieldPrefix="provider" vendorGroups={vendorGroups} contacts={contacts} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <PartyField fieldPrefix="operator" vendorGroups={vendorGroups} contacts={contacts} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <input
                type="text"
                name="notes"
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <ActionFormError />
            <div className="flex gap-2">
              <SubmitButton label="Add Output" />
              <button type="button" onClick={() => setShowAddOutput(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
        </ActionForm>
      )}

      {/* Output rows */}
      {mix.monitorOutputs.length > 0 && (
        <div className="ml-4 space-y-1">
          {mix.monitorOutputs.map((output) => (
            <MonitorOutputRow
              key={output.id}
              output={output}
              audioOutputOptions={audioOutputOptions}
              vendorGroups={vendorGroups}
              contacts={contacts}
              updateOutput={updateOutput}
              deleteOutput={deleteOutput}
            />
          ))}
        </div>
      )}

      {mix.monitorOutputs.length === 0 && !showAddOutput && (
        <p className="ml-4 text-xs text-gray-400 dark:text-gray-500 italic">No outputs — click Add Output to define output devices for this mix.</p>
      )}
    </div>
  );
}

// ============================================================================
// Main panel
// ============================================================================

export function AudioSectionPanel({
  audioSection,
  audioInputOptions,
  audioOutputOptions,
  vendorGroups,
  contactOptions,
  updateSection,
  createInputGroup,
  updateInputGroup,
  deleteInputGroup,
  createInputItem,
  updateInputItem,
  deleteInputItem,
  createMonitorMix,
  updateMonitorMix,
  deleteMonitorMix,
  createMonitorOutput,
  updateMonitorOutput,
  deleteMonitorOutput,
}: AudioSectionPanelProps) {
  const canWrite = useCanWrite("AV_ORDERS");
  const canDelete = useCanDelete("AV_ORDERS");
  const [editingNotes, setEditingNotes] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddMix, setShowAddMix] = useState(false);

  return (
    <div className="space-y-6">
      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Audio Notes</h2>
          {!editingNotes && canWrite && (
            <button onClick={() => setEditingNotes(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
          )}
        </div>
        {editingNotes && canWrite ? (
          <ActionForm action={updateSection} onDone={() => setEditingNotes(false)} className="space-y-3">
            <textarea
              name="notes"
              rows={4}
              defaultValue={audioSection.notes || ""}
              placeholder="Audio section notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <ActionFormError />
            <div className="flex gap-2">
              <SubmitButton label="Save" />
              <button type="button" onClick={() => setEditingNotes(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {audioSection.notes || <span className="text-gray-400 dark:text-gray-500 italic">None</span>}
          </p>
        )}
      </div>

      {/* Input Groups */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Input List</h2>
          {canWrite && (
            <button
              onClick={() => setShowAddGroup(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Add Group
            </button>
          )}
        </div>

        {showAddGroup && (
          <ActionForm
            action={createInputGroup}
            onDone={() => setShowAddGroup(false)}
            className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Group Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue="Default"
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <PartyField fieldPrefix="provider" vendorGroups={vendorGroups} contacts={contactOptions} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <PartyField fieldPrefix="operator" vendorGroups={vendorGroups} contacts={contactOptions} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <input
                type="text"
                name="notes"
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <ActionFormError />
            <div className="flex gap-2">
              <SubmitButton label="Add Group" />
              <button type="button" onClick={() => setShowAddGroup(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </ActionForm>
        )}

        {audioSection.inputGroups.length === 0 && !showAddGroup ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No input groups yet.</p>
        ) : (
          <div className="space-y-4">
            {audioSection.inputGroups.map((group) => (
              <InputGroupCard
                key={group.id}
                group={group}
                audioInputOptions={audioInputOptions}
                vendorGroups={vendorGroups}
                contacts={contactOptions}
                updateGroup={updateInputGroup}
                deleteGroup={deleteInputGroup}
                createItem={createInputItem}
                updateItem={updateInputItem}
                deleteItem={deleteInputItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Monitor Mixes */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Monitor Mixes</h2>
          {canWrite && (
            <button
              onClick={() => setShowAddMix(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Add Mix
            </button>
          )}
        </div>

        {showAddMix && (
          <ActionForm
            action={createMonitorMix}
            onDone={() => setShowAddMix(false)}
            className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Mix Name *</label>
                <input
                  type="text"
                  name="description"
                  required
                  placeholder="e.g., Drums, Stage right, Vocalist 1"
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  name="notes"
                  className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <ActionFormError />
            <div className="flex gap-2">
              <SubmitButton label="Add Mix" />
              <button type="button" onClick={() => setShowAddMix(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </ActionForm>
        )}

        {audioSection.monitorMixes.length === 0 && !showAddMix ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No monitor mixes yet.</p>
        ) : (
          <div className="space-y-2">
            {audioSection.monitorMixes.map((mix) => (
              <MonitorMixGroupCard
                key={mix.id}
                mix={mix}
                audioOutputOptions={audioOutputOptions}
                vendorGroups={vendorGroups}
                contacts={contactOptions}
                updateMix={updateMonitorMix}
                deleteMix={deleteMonitorMix}
                createOutput={createMonitorOutput}
                updateOutput={updateMonitorOutput}
                deleteOutput={deleteMonitorOutput}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
