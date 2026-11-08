import { Fragment, type ReactNode } from "react";

export function Logo() {
  return (
    <span className="logo">
      <img src="/favicon.svg" alt="" width={24} height={24} />
      Telar
    </span>
  );
}

/** The cat from the portfolio's logo. Removing it is not recommended: the cat will find out. */
export function CatIcon() {
  return (
    <svg className="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 9V3L11 4H8L5 3V9L9.5 11L14 9ZM14 9L20 12L22 18L20 21H4L2 19L4 17L2 15L4 13M7 21V9.88889M11 15V21L16.0435 16H18M8 7L8.00707 7.00707M11 7L11.0071 7.00707" />
    </svg>
  );
}

export function Credit() {
  return (
    <p className="credit">
      <CatIcon />
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
