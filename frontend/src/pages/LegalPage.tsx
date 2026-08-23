import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import privacyPolicy from "../legal/privacy-policy.md?raw";

// A tiny, dependency-free renderer for the handful of Markdown constructs the
// policy file actually uses — headings, list items, blockquotes, and plain
// paragraphs. Good enough for a legal document; not a general Markdown engine.
function renderMarkdown(source: string) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="mb-3 list-disc space-y-1 pl-5 text-sm text-txt-1">
        {listItems.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(<h1 key={i} className="mb-2 mt-1 text-lg font-bold text-txt-0">{trimmed.slice(2)}</h1>);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={i} className="mb-2 mt-5 text-sm font-semibold text-txt-0">{trimmed.slice(3)}</h2>);
    } else if (trimmed.startsWith("> ")) {
      flushList();
      blocks.push(
        <blockquote key={i} className="mb-3 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {trimmed.slice(2)}
        </blockquote>
      );
    } else if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed.startsWith("_") && trimmed.endsWith("_") && trimmed.length > 1) {
      flushList();
      blocks.push(<p key={i} className="mb-3 text-2xs italic text-txt-3">{trimmed.slice(1, -1)}</p>);
    } else if (trimmed) {
      flushList();
      blocks.push(<p key={i} className="mb-3 text-sm text-txt-1">{trimmed}</p>);
    } else {
      flushList();
    }
  });
  flushList();
  return blocks;
}

export function LegalPage() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-y-auto bg-bg-0">
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <Link to="/login" className="mb-6 inline-block text-2xs text-accent hover:underline">← Назад</Link>
        <div className="rounded-xl border border-line bg-bg-1 p-6">
          {renderMarkdown(privacyPolicy)}
        </div>
      </div>
    </div>
  );
}
