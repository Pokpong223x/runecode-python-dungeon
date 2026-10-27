# Easy boss reviews

The six bosses now review one small chapter task for beginners. Prompts have
one or two short sentences, reference plans have four or five lines, and each
starter has one TODO. Completing a starter needs one small edit. Bosses use the
same open Python concept contracts, room IDs, combat rules, and saved progress.

| Room | Task                                | Checked concepts     | Starter edit                |
| ---- | ----------------------------------- | -------------------- | --------------------------- |
| 1-4  | Print a camp message with a comment | print, comment       | Add one print() line        |
| 2-4  | Calculate using a numeric variable  | variable, arithmetic | Add print(fuel + 1)         |
| 3-4  | Read or count a short parcel list   | list                 | Add print(len(parcels))     |
| 4-4  | Run a loop and print                | for, print           | Replace pass with print()   |
| 5-4  | Call a ready-made simple function   | function             | Add ready()                 |
| 6-4  | Read one object attribute           | class                | Use gauge.power in attack() |

Room 1's TODO is already a valid comment. Room 2 accepts any numeric variable
read and executed numeric arithmetic, with printed output. Room 3 accepts a
list item read or len() of a list. Room 4 requires an entered for iteration and
an executed print call; it does not require a branch. Its references print in
the loop and keep combat actions after the loop so repetition does not consume
extra AP. Room 5 needs a function call, without parameters, return, or math.
Room 6 needs object construction and an object attribute read, without a method
or exception handler.

Printed messages, variable names, values, and combat choices remain open. A
short defensive plan can pass with zero MP and no potions. Merely defining a
function, creating a list, or writing code in an unentered branch does not
supply the executed evidence needed by the task. Bosses do not require exact
output strings or a fixed attack power.

The first two references use normal attacks and defense at zero MP. The third
uses one skill and defense at 4 MP, within 3 AP. Reference offense power keeps
fights short but is not a lesson requirement. The ordinary combat controls
still explain AP, resources, and victory; boss prompts do not append a long
rules paragraph. Hints give one short next step and no longer prepend the
neutral example's transfer paragraph.

Existing saves retain completed rooms, drafts, and battle checkpoints. The
simpler contracts can accept older valid code; no migration is needed. SaveGameV1
and progression IDs are unchanged.

## Verification

`tests/boss-curriculum.test.ts` runs the actual validator in Pyodide and checks
the emitted actions against the combat engine. It checks the prompt/reference
length limits, one TODO per starter, each completed starter edit, missing and
inactive concepts, short personal answers, zero-MP defensive choices, normal
and skill references in late boss phases, and printed loops for every intent.

`tests/python.test.ts` covers all three hero classes and full 24-room campaigns
with normal and skill-first reference strategies.
