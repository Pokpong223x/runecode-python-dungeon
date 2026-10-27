import { pythonLanguage } from "@codemirror/lang-python";
import type { OffensiveAction, SkillId } from "../types";
import { skillCommand } from "../skills";

export type OffenseMode = OffensiveAction | "mixed" | "none";
interface CodeChange {
  from: number;
  to: number;
  insert: string;
}

/** Parse Python tokens, so comments, strings and object methods stay untouched. */
export function inspectOffense(source: string) {
  const tree = pythonLanguage.parser.parse(source);
  const references: Array<{
    from: number;
    to: number;
    name: string;
    kind: OffensiveAction;
    skill?: SkillId;
  }> = [];
  let unsafe = false;
  tree.iterate({
    enter(node) {
      if (node.type.isError) unsafe = true;
      if (node.name !== "VariableName") return;
      const name = source.slice(node.from, node.to);
      if (!["attack", "skill", "pierce", "stun", "burst"].includes(name))
        return;
      const parent = node.node.parent;
      if (!parent) return;
      if (
        parent.name === "ArgList" &&
        node.node.nextSibling?.name === "AssignOp"
      )
        return;
      // Never rename learner-owned bindings (including parameters and loop names).
      // Conservative refusal is safer than silently changing the program's meaning.
      let owner = parent;
      while (
        owner.parent &&
        !/Statement$|Definition$|ParamList|ArgList/.test(owner.name)
      )
        owner = owner.parent;
      const assignment =
        owner.getChildren("AssignOp").at(-1) ?? owner.getChild("UpdateOp");
      const loopIn = owner.getChild("in");
      if (
        parent.name === "FunctionDefinition" ||
        parent.name === "ClassDefinition" ||
        owner.name === "ParamList" ||
        owner.name === "ImportStatement" ||
        node.node.prevSibling?.name === "for" ||
        node.node.prevSibling?.name === "as" ||
        (parent.name !== "ArgList" &&
          parent
            .getChildren("AssignOp")
            .some((operator) => node.from < operator.from)) ||
        (assignment && node.from < assignment.from) ||
        (loopIn && node.from < loopIn.from)
      ) {
        unsafe = true;
        return;
      }
      references.push({
        from: node.from,
        to: node.to,
        name,
        kind: name === "attack" ? "attack" : "skill",
        ...(name === "attack"
          ? {}
          : { skill: name === "skill" ? "class" : (name as SkillId) }),
      });
    },
  });
  const kinds = new Set(references.map((reference) => reference.kind));
  const skillIds = new Set(
    references
      .filter((reference) => reference.kind === "skill")
      .map((reference) => reference.skill!),
  );
  const skill: SkillId | "mixed" =
    skillIds.size > 1 ? "mixed" : ([...skillIds][0] ?? "class");
  const mode: OffenseMode =
    kinds.size > 1
      ? "mixed"
      : kinds.has("skill")
        ? "skill"
        : kinds.has("attack")
          ? "attack"
          : "none";
  return { references, mode, skill, unsafe };
}

export function offenseChanges(
  source: string,
  action: OffensiveAction,
  skill: SkillId = "class",
) {
  const inspection = inspectOffense(source);
  const name = action === "skill" ? skillCommand(skill) : action;
  const changes: CodeChange[] = inspection.references
    .filter((reference) => reference.name !== name)
    .map(({ from, to }) => ({ from, to, insert: name }));
  return { ...inspection, changes };
}
