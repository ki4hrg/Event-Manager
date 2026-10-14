"use client";

import { startTransition, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCanWrite } from "@/components/PermissionsProvider";

export type KeyStaffOrderItem = { id: string; name: string; detail: string | null };

function SortableRow({ item }: { item: KeyStaffOrderItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="p-1 -m-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      </button>
      <div className="min-w-0 break-words text-sm">
        <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
        {item.detail && <span className="text-gray-500 dark:text-gray-400"> · {item.detail}</span>}
      </div>
    </li>
  );
}

// Drag-to-reorder list of an event's key staff. Saves on every drop.
export function KeyStaffOrder({
  items,
  reorder,
}: {
  items: KeyStaffOrderItem[];
  reorder: (orderedIds: string[]) => Promise<void>;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(items);
  useEffect(() => {
    startTransition(() => setLocal(items));
  }, [items]);
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = arrayMove(
      local,
      local.findIndex((i) => i.id === active.id),
      local.findIndex((i) => i.id === over.id),
    );
    setLocal(next);
    await reorder(next.map((i) => i.id));
    router.refresh();
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={local.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {local.map((item) => (
            <SortableRow key={item.id} item={item} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

// Read-only content with a Reorder / Done toggle (Post-Event §II).
export function ReorderableKeyStaff({
  items,
  reorder,
  children,
}: {
  items: KeyStaffOrderItem[];
  reorder: (orderedIds: string[]) => Promise<void>;
  children: ReactNode;
}) {
  const canWrite = useCanWrite("EVENTS");
  const [reordering, setReordering] = useState(false);
  return (
    <div className="space-y-3">
      {canWrite && items.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setReordering(!reordering)}
            className="py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {reordering ? "Done" : "Reorder"}
          </button>
        </div>
      )}
      {reordering ? <KeyStaffOrder items={items} reorder={reorder} /> : children}
    </div>
  );
}
