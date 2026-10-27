import {
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import type {
  ActionKind,
  Diagnostic,
  OffensiveAction,
  SkillId,
} from "../types";
import { starterActionCall } from "../skills";
import {
  inspectOffense,
  offenseChanges,
  type OffenseMode,
} from "./offenseCode";
import { basicSetup } from "codemirror";
import {
  Decoration,
  EditorView,
  keymap,
  type DecorationSet,
} from "@codemirror/view";
import {
  EditorState,
  Prec,
  Compartment,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import { python } from "@codemirror/lang-python";
import { isolateHistory } from "@codemirror/commands";
const markErrorLine = StateEffect.define<number | undefined>();
const markExecutionLine = StateEffect.define<number | undefined>();
const executionLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    if (transaction.docChanged) marks = Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(markExecutionLine)) continue;
      const line = effect.value;
      marks =
        line &&
        Number.isInteger(line) &&
        line > 0 &&
        line <= transaction.state.doc.lines
          ? Decoration.set([
              Decoration.line({
                class: "cm-executing-line",
                attributes: {
                  "data-executing-line": String(line),
                  "aria-current": "step",
                },
              }).range(transaction.state.doc.line(line).from),
            ])
          : Decoration.none;
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, transaction) {
    if (transaction.docChanged) marks = Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(markErrorLine)) continue;
      const number = effect.value;
      marks =
        number &&
        Number.isInteger(number) &&
        number > 0 &&
        number <= transaction.state.doc.lines
          ? Decoration.set([
              Decoration.line({
                class: "cm-error-line",
                attributes: { "data-error-line": String(number) },
              }).range(transaction.state.doc.line(number).from),
            ])
          : Decoration.none;
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
interface Props {
  ref?: Ref<EditorHandle>;
  value: string;
  onChange: (code: string) => void;
  onRun: () => void;
  onSkills: (trigger: HTMLButtonElement) => void;
  onOffenseChange: (mode: OffenseMode, skill: SkillId | "mixed") => void;
  skillsDisabled?: boolean;
  size: number;
  disabled?: boolean;
  diagnostic?: Diagnostic;
  execution?: ExecutionMark;
}
export interface ExecutionMark {
  source: string;
  line: number;
  command: string;
}
export interface EditorHandle {
  insertAction: (action: ActionKind, skill?: SkillId) => boolean;
  chooseOffense: (action: OffensiveAction, skill?: SkillId) => boolean;
  focusLine: (line?: number) => void;
}
export function Editor({
  ref,
  value,
  onChange,
  onRun,
  onSkills,
  onOffenseChange,
  skillsDisabled,
  size,
  disabled,
  diagnostic,
  execution,
}: Props) {
  const currentExecution = execution?.source === value ? execution : undefined;
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    editable = useRef(new Compartment()),
    callbacks = useRef({ onChange, onRun, onOffenseChange });
  callbacks.current = { onChange, onRun, onOffenseChange };
  function insertGameAction(
    action: ActionKind,
    choose = false,
    focus = true,
    skill: SkillId = "class",
  ) {
    const v = view.current;
    if (!v || disabled || skillsDisabled) return false;
    if (action === "attack" || action === "skill") {
      const plan = offenseChanges(v.state.doc.toString(), action, skill);
      if (plan.unsafe) return false;
      if (plan.changes.length) {
        if (
          v.state.doc.length +
            plan.changes.reduce(
              (delta, change) =>
                delta + change.insert.length - (change.to - change.from),
              0,
            ) >
          16000
        )
          return false;
        v.dispatch({
          changes: plan.changes,
          annotations: [
            Transaction.userEvent.of("input.skill"),
            isolateHistory.of("full"),
          ],
        });
        if (focus) v.focus();
        return true;
      }
      if (choose && plan.references.length) {
        if (focus) v.focus();
        return true;
      }
    }
    const line = v.state.doc.lineAt(v.state.selection.main.head);
    const indent = line.text.match(/^\s*/)?.[0] ?? "";
    const blank = !line.text.trim();
    const text = `${blank ? "" : "\n"}${indent}${starterActionCall(action, skill)}`;
    const from = blank ? line.from : line.to;
    if (v.state.doc.length + text.length - (blank ? line.length : 0) > 16000)
      return false;
    v.dispatch({
      changes: { from, to: line.to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: focus,
      annotations: [
        Transaction.userEvent.of("input.skill"),
        isolateHistory.of("full"),
      ],
    });
    if (focus) v.focus();
    return true;
  }
  useImperativeHandle(
    ref,
    () => ({
      insertAction(action, skill) {
        return insertGameAction(
          action,
          action === "attack" || action === "skill",
          true,
          skill,
        );
      },
      chooseOffense(action, skill) {
        return insertGameAction(action, true, false, skill);
      },
      focusLine(number = 1) {
        const v = view.current;
        if (!v) return;
        const line = v.state.doc.line(
          Math.max(1, Math.min(v.state.doc.lines, number)),
        );
        v.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
        v.focus();
      },
    }),
    [disabled, skillsDisabled],
  );
  useLayoutEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          python(),
          EditorView.lineWrapping,
          editable.current.of(EditorView.editable.of(!disabled)),
          errorLineField,
          executionLineField,
          Prec.highest(
            keymap.of([
              {
                key: "Mod-Enter",
                run: () => {
                  callbacks.current.onRun();
                  return true;
                },
              },
              {
                key: "Tab",
                run: (v) => {
                  v.dispatch(v.state.replaceSelection("    "));
                  return true;
                },
              },
            ]),
          ),
          EditorView.contentAttributes.of({
            "aria-label": "เขียนโค้ด Python",
            "aria-describedby": "python-feedback",
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              callbacks.current.onChange(u.state.doc.toString());
              const selection = inspectOffense(u.state.doc.toString());
              callbacks.current.onOffenseChange(
                selection.mode,
                selection.skill,
              );
            }
          }),
          EditorView.theme({
            "&": {
              backgroundColor: "#102c32",
              color: "#e9f3dc",
              minHeight: "250px",
            },
            ".cm-content": {
              fontFamily: "Consolas, Menlo, monospace",
              padding: "16px 0",
              caretColor: "#ade3c4",
            },
            ".cm-line": { padding: "0 16px" },
            ".cm-gutters": {
              backgroundColor: "#102c32",
              color: "#6e9897",
              borderRight: "1px solid #25474a",
            },
            ".cm-activeLine": { backgroundColor: "#ffffff08" },
            ".cm-activeLineGutter": { backgroundColor: "#244345" },
            "&.cm-focused": { outline: "none" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              backgroundColor: "#37685f !important",
            },
            ".cm-cursor": { borderLeftColor: "#ade3c4" },
          }),
        ],
      }),
    });
    view.current = editor;
    const selection = inspectOffense(editor.state.doc.toString());
    callbacks.current.onOffenseChange(selection.mode, selection.skill);
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(EditorView.editable.of(!disabled)),
    });
  }, [disabled]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: markErrorLine.of(diagnostic?.line) });
    v.contentDOM.setAttribute("aria-invalid", String(!!diagnostic));
  }, [diagnostic, value]);
  useLayoutEffect(() => {
    // Presentation never moves selection, scrolls the page or takes focus.
    view.current?.dispatch({
      effects: markExecutionLine.of(currentExecution?.line),
    });
  }, [currentExecution, value]);
  function insert(text: string) {
    const v = view.current;
    if (!v) return;
    v.dispatch(v.state.replaceSelection(text));
    v.focus();
  }
  return (
    <div className="editor-container" style={{ fontSize: size }}>
      <div className="editor-file">
        <span>
          <i /> main.py
        </span>
        <span
          className={currentExecution ? "editor-playback-label" : undefined}
        >
          {currentExecution ? (
            `▶ บรรทัด ${currentExecution.line} · ${currentExecution.command}`
          ) : (
            <>
              PYTHON <span className="editor-prompt">⌘ ↵ เพื่อรัน</span>
            </>
          )}
        </span>
      </div>
      <div
        ref={host}
        className="code-host"
        data-testid="editor"
        aria-disabled={disabled}
      />
      <div className="editor-tools" aria-label="ตัวช่วยเขียนโค้ด">
        {[
          ["↹", "    "],
          ["( )", "()"],
          [": ", ":"],
          ['" "', '""'],
          ["attack", "attack()"],
          ["defend", "defend()"],
        ].map(([label, text]) => (
          <button
            type="button"
            key={label}
            onClick={() => insert(text)}
            aria-label={`แทรก ${label}`}
            disabled={disabled}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={(event) => onSkills(event.currentTarget)}
          aria-label="เปิดหน้าสกิล"
          disabled={disabled || skillsDisabled}
        >
          สกิล
        </button>
      </div>
    </div>
  );
}
