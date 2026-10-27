import { actionAP } from "./engine";
import { actionCall, TURN_AP } from "./skills";
import type { ActionTrace, APBudget } from "./types";

/** Trace is bounded to four executed commands by Python, including the rejected fourth. */
export function actionBudget(
  trace: ActionTrace[] = [],
  source: string,
  limited = false,
): APBudget | undefined {
  if (!trace.length) return;
  const rows: APBudget["rows"] = [];
  let total = 0;
  let firstOverLine: number | undefined;
  const lines = source.split("\n").length;
  for (const action of trace) {
    if (
      !Number.isInteger(action.line) ||
      action.line < 1 ||
      action.line > lines
    )
      continue;
    const ap = actionAP(action.kind);
    total += ap;
    if (total > TURN_AP && firstOverLine === undefined)
      firstOverLine = action.line;
    const command = actionCall(action);
    const row = rows.find(
      (item) => item.line === action.line && item.command === command,
    );
    if (row) {
      row.count++;
      row.ap += ap;
    } else
      rows.push({
        line: action.line,
        command,
        count: 1,
        ap,
        loopLine: action.loopLine,
      });
  }
  for (const row of rows) {
    if (total > TURN_AP && row.count > 1) {
      const perCall = row.ap / row.count;
      row.suggestedCalls = Math.max(
        0,
        Math.floor((TURN_AP - (total - row.ap)) / perCall),
      );
    }
  }
  return rows.length ? { total, limited, rows, firstOverLine } : undefined;
}
