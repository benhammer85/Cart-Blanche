"use client";
import type React from "react";
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGrip } from "@/components/icons";
import { cx } from "@/components/ui";

/** Vertical drag-to-reorder list of cards (grip handle in each card's header). */
export default function DayList({ ids, onReorder, render }: { ids: string[]; onReorder: (ids: string[]) => void; render: (id: string, index: number, handle: React.ReactNode) => React.ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e: DragEndEvent) => {
        if (!e.over || e.active.id === e.over.id) return;
        onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="mt-4 space-y-4">
          {ids.map((id, i) => (
            <DayItem key={id} id={id}>
              {(handle) => render(id, i, handle)}
            </DayItem>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function DayItem({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button {...attributes} {...listeners} className="touch-none px-1 text-lg text-muted" aria-label="Drag to change the day">
      <IconGrip />
    </button>
  );
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("relative", isDragging && "z-10 opacity-90 shadow-xl")}>
      {children(handle)}
    </li>
  );
}
