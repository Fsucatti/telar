import { ChevronDown, ChevronRight, GripVertical, Search, X } from "lucide-react";
import { useState } from "react";
import { CATALOG, type CatalogItem } from "../flow/catalog";
import { useStore } from "../state/store";
import { Credit } from "./common";

export const DRAG_TYPE = "application/x-telar-block";

function PaletteItem({ item, onAdded }: { item: CatalogItem; onAdded: () => void }) {
  const Icon = item.icon;
  return (
    <button
      className="palette-item"
      disabled={!item.available}
      draggable={item.available}
      title={item.available ? "Click to add, or drag onto the canvas" : "Coming soon"}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => {
        const data = item.create?.();
        if (data) {
          useStore.getState().addBlock(data);
          onAdded();
        }
      }}
    >
      <span className="palette-icon">
        <Icon size={16} />
      </span>
      <span className="palette-text">
        <strong>{item.label}</strong>
        <span className="muted small">{item.hint}</span>
      </span>
      {item.available && <GripVertical size={14} className="palette-grip" />}
    </button>
  );
}

export function findCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.flatMap((section) => section.items).find((item) => item.id === id);
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ models: true });
  const term = query.trim().toLowerCase();

  return (
    <aside className={`palette${open ? " is-open" : ""}`} aria-label="Blocks">
      <div className="palette-head">
        <label className="search">
          <Search size={15} />
          <input placeholder="Search blocks" aria-label="Search blocks" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className="icon-button palette-close" aria-label="Close block list" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="palette-sections">
        {CATALOG.map((section) => {
          const items = section.items.filter(
            (item) => !term || `${item.label} ${item.hint} ${section.label}`.toLowerCase().includes(term),
          );
          if (items.length === 0) return null;
          const isOpen = Boolean(term) || expanded[section.id];
          const Icon = section.icon;
          return (
            <section key={section.id} className="palette-section">
              <button
                className="palette-section-head"
                aria-expanded={isOpen}
                onClick={() => setExpanded({ ...expanded, [section.id]: !expanded[section.id] })}
              >
                <Icon size={15} />
                <span>{section.label}</span>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {isOpen && (
                <div className="palette-items">
                  {items.map((item) => (
                    <PaletteItem key={item.id} item={item} onAdded={onClose} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <Credit />
    </aside>
  );
}
