/**
 * Document search that runs in the browser, with no database or embeddings.
 * It splits documents into passages and ranks them with BM25, a classic keyword score.
 */
import type { KnowledgeDoc } from "../flow/types";

export interface Passage {
  docName: string;
  text: string;
  score: number;
}

const MAX_PASSAGE_CHARS = 900;
const MAX_CONTEXT_CHARS = 8_000;

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => word.length > 1) ?? []
  );
}

export function splitIntoPassages(text: string): string[] {
  const passages: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n\s*\n/)) {
    const clean = paragraph.trim();
    if (!clean) continue;
    if (current && current.length + clean.length > MAX_PASSAGE_CHARS) {
      passages.push(current);
      current = "";
    }
    if (clean.length > MAX_PASSAGE_CHARS) {
      for (let start = 0; start < clean.length; start += MAX_PASSAGE_CHARS) {
        passages.push(clean.slice(start, start + MAX_PASSAGE_CHARS));
      }
    } else {
      current = current ? `${current}\n\n${clean}` : clean;
    }
  }
  if (current) passages.push(current);
  return passages;
}

/** Returns the best passages from the included documents, within the context budget. */
export function searchDocuments(docs: KnowledgeDoc[], query: string, topK: number): Passage[] {
  const corpus = docs
    .filter((doc) => doc.included)
    .flatMap((doc) =>
      splitIntoPassages(doc.text).map((text) => ({
        docName: doc.name,
        text,
        tokens: tokenize(text),
      })),
    );
  if (corpus.length === 0) return [];

  const queryTerms = [...new Set(tokenize(query))];
  const averageLength = corpus.reduce((sum, item) => sum + item.tokens.length, 0) / corpus.length;
  const k1 = 1.4;
  const b = 0.75;

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, corpus.filter((item) => item.tokens.includes(term)).length);
  }

  const scored = corpus.map((item) => {
    let score = 0;
    for (const term of queryTerms) {
      const frequency = item.tokens.filter((token) => token === term).length;
      if (frequency === 0) continue;
      const containing = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (corpus.length - containing + 0.5) / (containing + 0.5));
      const lengthRatio = item.tokens.length / (averageLength || 1);
      score += (idf * frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * lengthRatio));
    }
    return { docName: item.docName, text: item.text, score };
  });

  scored.sort((a, b2) => b2.score - a.score);
  // With no keyword match (say, "summarize this") the opening passages are the best guess.
  const ranked = scored[0].score > 0 ? scored.filter((item) => item.score > 0) : scored;

  const selected: Passage[] = [];
  let budget = MAX_CONTEXT_CHARS;
  for (const passage of ranked.slice(0, topK)) {
    if (passage.text.length > budget) break;
    selected.push(passage);
    budget -= passage.text.length;
  }
  return selected;
}

export function formatPassages(passages: Passage[]): string {
  return passages.map((passage) => `[${passage.docName}]\n${passage.text}`).join("\n\n---\n\n");
}
