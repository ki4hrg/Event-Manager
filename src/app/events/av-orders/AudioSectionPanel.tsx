"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
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
  type PartyOptions,
  type ContactOptions,
  mergeAndSortVendors,
  partyLabel,
  PartyField,
} from "./party-field";
import { GroupedEquipmentSelect } from "./grouped-equipment-select";

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
  vendorOptions: PartyOptions;
  contactOptions: ContactOptions;
  updateSection: (formData: FormData) => Promise<void>;
  createInputGroup: (formData: FormData) => Promise<void>;
  updateInputGroup: (id: string, formData: FormData) => Promise<void>;
  deleteInputGroup: (id: string) => Promise<void>;
  createInputItem: (inputGroupId: string, formData: FormData) => Promise<void>;
  updateInputItem: (id: string, formData: FormData) => Promise<void>;
  deleteInputItem: (id: string) => Promise<void>;
  createMonitorMix: (formData: FormData) => Promise<void>;
  updateMonitorMix: (id: string, formData: FormData) => Promise<void>;
  deleteMonitorMix: (id: string) => Promise<void>;
  createMonitorOutput: (monitorMixId: string, formData: FormData) => Promise<void>;
  updateMonitorOutput: (id: string, formData: FormData) => Promise<void>;
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
  vendors,
  contacts,
  updateItem,
  deleteItem,
}: {
  item: InputItemFull;
  audioInputOptions: Equipment[];
  vendors: PartyOptions;
  contacts: ContactOptions;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  const effectiveVendors = useMemo(
    () => mergeAndSortVendors(vendors, [item.providerVendor, item.operatorVendor]),
    [vendors, item.providerVendor, item.operatorVendor]
  );

  const provider = partyLabel(item.providerVendor, item.providerContact);
  const operator = partyLabel(item.operatorVendor, item.operatorContact);

  return (
    <div className="ml-4 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
      {editing ? (
        <form
          action={async (fd) => {
            await updateItem(item.id, fd);
            setEditing(false);
          }}
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
              <PartyField fieldPrefix="provider" vendors={effectiveVendors} contacts={contacts} defaultVendorId={item.providerVendorId} defaultContactId={item.providerContactId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField fieldPrefix="operator" vendors={effectiveVendors} contacts={contacts} defaultVendorId={item.operatorVendorId} defaultContactId={item.operatorContactId} />
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
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between">
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">{item.description}</span>
            <span className="text-gray-500 dark:text-gray-400"> × {item.quantity}</span>
            {item.equipment && <span className="ml-2 text-gray-500 dark:text-gray-400">({item.equipment.name})</span>}
            {provider && <span className="ml-2 text-gray-500 dark:text-gray-400">Provider: {provider}</span>}
            {operator && <span className="ml-2 text-gray-500 dark:text-gray-400">Op: {operator}</span>}
            {item.notes && <span className="ml-2 text-gray-400 dark:text-gray-500">· {item.notes}</span>}
          </div>
          <div className="flex gap-2 ml-2 shrink-0">
            <button onClick={() => setEditing(true)} className="text-blue-600 hover:underline text-xs">Edit</button>
            <button
              onClick={async () => { if (confirm("Delete this input?")) await deleteItem(item.id); }}
              className="text-red-600 hover:underline text-xs"
            >Delete</button>
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
  vendors,
  contacts,
  updateGroup,
  deleteGroup,
  createItem,
  updateItem,
  deleteItem,
}: {
  group: InputGroupFull;
  audioInputOptions: Equipment[];
  vendors: PartyOptions;
  contacts: ContactOptions;
  updateGroup: (id: string, formData: FormData) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  createItem: (inputGroupId: string, formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
}) {
  const [editingGroup, setEditingGroup] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);

  const effectiveVendors = useMemo(
    () => mergeAndSortVendors(vendors, [group.providerVendor, group.operatorVendor]),
    [vendors, group.providerVendor, group.operatorVendor]
  );

  const provider = partyLabel(group.providerVendor, group.providerContact);
  const operator = partyLabel(group.operatorVendor, group.operatorContact);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Group header */}
      {editingGroup ? (
        <form
          action={async (fd) => {
            await updateGroup(group.id, fd);
            setEditingGroup(false);
          }}
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
              <PartyField fieldPrefix="provider" vendors={effectiveVendors} contacts={contacts} defaultVendorId={group.providerVendorId} defaultContactId={group.providerContactId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField fieldPrefix="operator" vendors={effectiveVendors} contacts={contacts} defaultVendorId={group.operatorVendorId} defaultContactId={group.operatorContactId} />
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
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditingGroup(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900">
          <div>
            <span className="font-medium text-gray-900 dark:text-white text-sm">{group.name}</span>
            {provider && <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">Provider: {provider}</span>}
            {operator && <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">Op: {operator}</span>}
            {group.notes && <span className="ml-3 text-xs text-gray-400 dark:text-gray-500">· {group.notes}</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditingGroup(true)} className="text-blue-600 hover:underline text-xs">Edit</button>
            <button
              onClick={async () => { if (confirm(`Delete group "${group.name}" and all its inputs?`)) await deleteGroup(group.id); }}
              className="text-red-600 hover:underline text-xs"
            >Delete</button>
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
            vendors={effectiveVendors}
            contacts={contacts}
            updateItem={updateItem}
            deleteItem={deleteItem}
          />
        ))}

        {showAddItem ? (
          <form
            action={async (fd) => {
              await createItem(group.id, fd);
              setShowAddItem(false);
            }}
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
                <PartyField fieldPrefix="provider" vendors={effectiveVendors} contacts={contacts} defaultVendorId={group.providerVendorId} defaultContactId={group.providerContactId} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <PartyField fieldPrefix="operator" vendors={effectiveVendors} contacts={contacts} defaultVendorId={group.operatorVendorId} defaultContactId={group.operatorContactId} />
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
            <div className="flex gap-2">
              <SubmitButton label="Add Input" />
              <button type="button" onClick={() => setShowAddItem(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddItem(true)}
            className="ml-4 text-xs text-blue-600 hover:underline"
          >
            + Add Input
          </button>
        )}
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
  vendors,
  contacts,
  updateOutput,
  deleteOutput,
}: {
  output: MonitorOutputFull;
  audioOutputOptions: Equipment[];
  vendors: PartyOptions;
  contacts: ContactOptions;
  updateOutput: (id: string, formData: FormData) => Promise<void>;
  deleteOutput: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  const effectiveVendors = useMemo(
    () => mergeAndSortVendors(vendors, [output.providerVendor, output.operatorVendor]),
    [vendors, output.providerVendor, output.operatorVendor]
  );

  const provider = partyLabel(output.providerVendor, output.providerContact);
  const operator = partyLabel(output.operatorVendor, output.operatorContact);

  return (
    <div className="p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
      {editing ? (
        <form
          action={async (fd) => {
            await updateOutput(output.id, fd);
            setEditing(false);
          }}
          className="space-y-2"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
              <PartyField fieldPrefix="provider" vendors={effectiveVendors} contacts={contacts} defaultVendorId={output.providerVendorId} defaultContactId={output.providerContactId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField fieldPrefix="operator" vendors={effectiveVendors} contacts={contacts} defaultVendorId={output.operatorVendorId} defaultContactId={output.operatorContactId} />
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
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-900 dark:text-white">
            <span className="text-gray-500 dark:text-gray-400 mr-1">×{output.quantity}</span>
            <span>{output.equipment?.name ?? <span className="italic text-gray-400">No type</span>}</span>
            {provider && <span className="ml-2 text-gray-500 dark:text-gray-400">Provider: {provider}</span>}
            {operator && <span className="ml-2 text-gray-500 dark:text-gray-400">Op: {operator}</span>}
            {output.notes && <span className="ml-2 text-gray-400 dark:text-gray-500">· {output.notes}</span>}
          </div>
          <div className="flex gap-2 ml-2 shrink-0">
            <button onClick={() => setEditing(true)} className="text-blue-600 hover:underline text-xs">Edit</button>
            <button
              onClick={async () => { if (confirm("Delete this output?")) await deleteOutput(output.id); }}
              className="text-red-600 hover:underline text-xs"
            >Delete</button>
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
  vendors,
  contacts,
  updateMix,
  deleteMix,
  createOutput,
  updateOutput,
  deleteOutput,
}: {
  mix: MonitorMixFull;
  audioOutputOptions: Equipment[];
  vendors: PartyOptions;
  contacts: ContactOptions;
  updateMix: (id: string, formData: FormData) => Promise<void>;
  deleteMix: (id: string) => Promise<void>;
  createOutput: (monitorMixId: string, formData: FormData) => Promise<void>;
  updateOutput: (id: string, formData: FormData) => Promise<void>;
  deleteOutput: (id: string) => Promise<void>;
}) {
  const [editingGroup, setEditingGroup] = useState(false);
  const [showAddOutput, setShowAddOutput] = useState(false);

  return (
    <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
      {/* Group header */}
      {editingGroup ? (
        <form
          action={async (fd) => {
            await updateMix(mix.id, fd);
            setEditingGroup(false);
          }}
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
          <div className="flex gap-2">
            <SubmitButton label="Save" />
            <button type="button" onClick={() => setEditingGroup(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900 dark:text-white">
            {mix.description}
            {mix.notes && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-normal">· {mix.notes}</span>}
          </span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowAddOutput(true)} className="text-blue-600 hover:underline text-xs">Add Output</button>
            <button onClick={() => setEditingGroup(true)} className="text-blue-600 hover:underline text-xs">Edit</button>
            <button
              onClick={async () => { if (confirm("Delete this mix and all its outputs?")) await deleteMix(mix.id); }}
              className="text-red-600 hover:underline text-xs"
            >Delete</button>
          </div>
        </div>
      )}

      {/* Add output form */}
      {showAddOutput && (
        <form
          action={async (fd) => {
            await createOutput(mix.id, fd);
            setShowAddOutput(false);
          }}
          className="ml-4 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 space-y-2"
        >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
                <PartyField fieldPrefix="provider" vendors={vendors} contacts={contacts} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <PartyField fieldPrefix="operator" vendors={vendors} contacts={contacts} />
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
            <div className="flex gap-2">
              <SubmitButton label="Add Output" />
              <button type="button" onClick={() => setShowAddOutput(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
        </form>
      )}

      {/* Output rows */}
      {mix.monitorOutputs.length > 0 && (
        <div className="ml-4 space-y-1">
          {mix.monitorOutputs.map((output) => (
            <MonitorOutputRow
              key={output.id}
              output={output}
              audioOutputOptions={audioOutputOptions}
              vendors={vendors}
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
  vendorOptions,
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
  const [editingNotes, setEditingNotes] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddMix, setShowAddMix] = useState(false);

  const handleUpdateNotes = async (formData: FormData) => {
    await updateSection(formData);
    setEditingNotes(false);
  };

  return (
    <div className="space-y-6">
      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Audio Notes</h2>
          {!editingNotes && (
            <button onClick={() => setEditingNotes(true)} className="text-sm text-blue-600 hover:underline">Edit</button>
          )}
        </div>
        {editingNotes ? (
          <form action={handleUpdateNotes} className="space-y-3">
            <textarea
              name="notes"
              rows={4}
              defaultValue={audioSection.notes || ""}
              placeholder="Audio section notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <SubmitButton label="Save" />
              <button type="button" onClick={() => setEditingNotes(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {audioSection.notes || <span className="text-gray-400 dark:text-gray-500 italic">None</span>}
          </p>
        )}
      </div>

      {/* Input Groups */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Input List</h2>
          <button
            onClick={() => setShowAddGroup(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Group
          </button>
        </div>

        {showAddGroup && (
          <form
            action={async (fd) => {
              await createInputGroup(fd);
              setShowAddGroup(false);
            }}
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
                <PartyField fieldPrefix="provider" vendors={vendorOptions} contacts={contactOptions} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                <PartyField fieldPrefix="operator" vendors={vendorOptions} contacts={contactOptions} />
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
            <div className="flex gap-2">
              <SubmitButton label="Add Group" />
              <button type="button" onClick={() => setShowAddGroup(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </form>
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
                vendors={vendorOptions}
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Monitor Mixes</h2>
          <button
            onClick={() => setShowAddMix(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Mix
          </button>
        </div>

        {showAddMix && (
          <form
            action={async (fd) => {
              await createMonitorMix(fd);
              setShowAddMix(false);
            }}
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
            <div className="flex gap-2">
              <SubmitButton label="Add Mix" />
              <button type="button" onClick={() => setShowAddMix(false)} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">Cancel</button>
            </div>
          </form>
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
                vendors={vendorOptions}
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
