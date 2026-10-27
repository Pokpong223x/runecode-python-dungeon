import type { Concept } from "./types";

export interface LearningExample {
  code: string;
  output: string[];
  question: string;
  transfer: string;
}

/** Short reading examples for Grade 10 beginners; no combat commands. */
export const LEARNING_EXAMPLES: Record<Concept, LearningExample> = {
  print: {
    code: 'print("Star")',
    output: ["Star"],
    question: "What text appears?",
    transfer: "Put text inside quotes, then call print().",
  },
  sequence: {
    code: "print(2)\nprint(1)",
    output: ["2", "1"],
    question: "Which number appears first?",
    transfer: "Python runs each line from top to bottom.",
  },
  comment: {
    code: '# Say hello.\nprint("Hello")',
    output: ["Hello"],
    question: "Does the comment appear?",
    transfer: "Start a comment with #. Python skips that line.",
  },
  variable: {
    code: "coins = 4\nprint(coins)",
    output: ["4"],
    question: "What value does coins store?",
    transfer: "Use the variable name to read its value.",
  },
  string: {
    code: 'name = "Star"\nprint(name)',
    output: ["Star"],
    question: "What does print(name) display?",
    transfer: "Store text in quotes and print the variable.",
  },
  arithmetic: {
    code: "fruit = 6\neaten = 2\nprint(fruit - eaten)",
    output: ["4"],
    question: "How much fruit remains?",
    transfer: "Use - to subtract one number from another.",
  },
  list: {
    code: "items = [4, 6, 8]\nprint(items[1])",
    output: ["6"],
    question: "Which item has index 1?",
    transfer: "The first item has index 0.",
  },
  tuple: {
    code: "point = (5, 7)\nprint(point[0])",
    output: ["5"],
    question: "Which value has index 0?",
    transfer: "Read a tuple item with square brackets.",
  },
  set: {
    code: 'colors = {"red", "blue", "red"}\nprint(len(colors))',
    output: ["2"],
    question: "How many different colors remain?",
    transfer: "A set keeps each value only once.",
  },
  if: {
    code: 'coins = 0\nif coins == 0:\n    print("Empty")',
    output: ["Empty"],
    question: "Is coins equal to 0?",
    transfer: "Indent the line that runs when the condition is true.",
  },
  for: {
    code: "for step in range(3):\n    print(step)",
    output: ["0", "1", "2"],
    question: "How many times does print() run?",
    transfer: "range(3) gives 0, 1, and 2.",
  },
  while: {
    code: "count = 3\nwhile count > 0:\n    count -= 1\nprint(count)",
    output: ["0"],
    question: "When does the loop stop?",
    transfer: "Change the counter so the condition becomes false.",
  },
  function: {
    code: "def stars():\n    return 4\nprint(stars())",
    output: ["4"],
    question: "What value does stars() return?",
    transfer: "Define the function, then call it with parentheses.",
  },
  parameter: {
    code: "def add_stamp(count):\n    return count + 2\nprint(add_stamp(3))",
    output: ["5"],
    question: "What value does count receive?",
    transfer: "The argument becomes the parameter value.",
  },
  math: {
    code: "import math\nprint(math.floor(4.8))",
    output: ["4"],
    question: "What whole number does floor() return?",
    transfer: "floor() rounds down to a whole number.",
  },
  class: {
    code: "class Bag:\n    size = 4\nbag = Bag()\nprint(bag.size)",
    output: ["4"],
    question: "What value does bag.size hold?",
    transfer: "Create an object, then read its attribute with a dot.",
  },
  method: {
    code: "class Bell:\n    def notes(self):\n        return 4\nbell = Bell()\nprint(bell.notes())",
    output: ["4"],
    question: "What value does bell.notes() return?",
    transfer: "Call the method through the object.",
  },
  exception: {
    code: 'try:\n    4 / 0\nexcept ZeroDivisionError:\n    print("Try again")',
    output: ["Try again"],
    question: "Why does the except block run?",
    transfer: "Catch the error type raised inside try.",
  },
};
