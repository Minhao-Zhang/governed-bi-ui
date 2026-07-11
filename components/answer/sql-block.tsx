"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Read-only SQL, monospace + lightly syntax-highlighted. The engine owns the
 * write path; this only displays the SQL the answer executed. */
export function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      toast.success("SQL copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="relative rounded-md border bg-muted/40">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">SQL</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono">{highlightSql(sql)}</code>
      </pre>
    </div>
  );
}

/* ── Minimal SQL syntax highlighter ───────────────────────────────────────── */

const KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "AS", "ON", "JOIN", "INNER",
  "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", "GROUP", "BY", "ORDER", "HAVING",
  "LIMIT", "OFFSET", "DISTINCT", "UNION", "ALL", "IN", "IS", "NULL", "LIKE",
  "BETWEEN", "CASE", "WHEN", "THEN", "ELSE", "END", "ASC", "DESC", "WITH",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "EXISTS", "USING",
  "OVER", "PARTITION", "TRUE", "FALSE",
]);

const FUNCTIONS = new Set([
  "AVG", "COUNT", "SUM", "MIN", "MAX", "ROUND", "COALESCE", "CAST", "ABS",
  "LOWER", "UPPER", "LENGTH", "NOW", "DATE", "SUBSTR", "SUBSTRING", "TRIM",
  "CONCAT", "IFNULL", "NULLIF",
]);

// Order matters: comments and strings are matched before words so a keyword
// inside a string/comment isn't recolored. Double-quoted tokens are SQL
// identifiers (not strings). Longest safe matches win per position.
const TOKEN =
  /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([(),.;*=<>!+/-]+)/g;

function highlightSql(sql: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  const push = (text: string, cls?: string) => {
    if (!text) return;
    out.push(
      cls ? (
        <span key={key++} className={cls}>
          {text}
        </span>
      ) : (
        <span key={key++}>{text}</span>
      ),
    );
  };

  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(sql)) !== null) {
    if (m.index > last) push(sql.slice(last, m.index)); // whitespace / unmatched
    const [full, comment, str, dquote, num, word, punct] = m;
    // Code palette deliberately avoids the reliability hues (green/amber/red) so
    // "color = trust" holds app-wide; shades are AA-safe on the muted code bg.
    if (comment) push(full, "text-muted-foreground italic");
    else if (str) push(full, "text-cyan-700 dark:text-cyan-300");
    else if (dquote) push(full, "text-foreground");
    else if (num) push(full); // numbers stay default — no tier-hue collision
    else if (word) {
      const upper = word.toUpperCase();
      if (KEYWORDS.has(upper)) push(full, "font-medium text-blue-700 dark:text-blue-300");
      else if (FUNCTIONS.has(upper)) push(full, "text-violet-700 dark:text-violet-300");
      else push(full);
    } else if (punct) push(full, "text-muted-foreground");
    else push(full);
    last = m.index + full.length;
  }
  if (last < sql.length) push(sql.slice(last));
  return out;
}
