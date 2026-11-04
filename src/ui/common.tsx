import { Fragment, type ReactNode } from "react";

export function Logo() {
  return (
    <span className="logo">
      <img src="/favicon.svg" alt="" width={24} height={24} />
      Telar
    </span>
  );
}

export function Credit() {
  return (
    <p className="credit">
      Design by Julian Sucatti · Built by{" "}
      <a href="https://fsucatti-portfolio.fsucatti-portfolio.workers.dev" target="_blank" rel="noreferrer">
        Francisco Sucatti
      </a>
    </p>
  );
}

/** Bold and inline code. Everything renders as React text, so model output can't inject HTML. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_(?=\s|$))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/** A small safe subset of Markdown: headings, lists, paragraphs, bold, italics and code. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{renderInline(item)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };

  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    if (heading) blocks.push(<h4 key={blocks.length}>{renderInline(heading[1])}</h4>);
    else if (line.trim()) blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
  }
  flushList();
  return <div className="markdown">{blocks}</div>;
}
