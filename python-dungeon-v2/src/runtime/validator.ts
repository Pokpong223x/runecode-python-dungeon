import { SOURCE_EXERCISE_VALIDATION } from "./sourceValidation";

export const PYTHON_VALIDATOR = String.raw`
import ast, copy, json, math, traceback, tokenize, io, sys, types

def _evaluate(payload):
    actions, output, executed, entered, math_reads = [], [], set(), set(), set()
    trace = []
    action_evidence, active_commands, command_functions, command_kinds = [], [], set(), {}
    successful_prints = set()
    print_texts, source_print_events = [], []
    function_definitions, function_calls = {}, {}
    expression_sources, returned_values, actual_numbers = {}, {}, {}
    function_return_sources, call_return_sources = {}, {}
    source_values, source_calls, source_indexes, assignment_events = {}, {}, {}, []
    division_errors, handled_divisions = {}, {}
    source_exercise = payload['contract'].get('sourceExercise')
    class_values, instances, constructed, instance_classes = {}, set(), set(), {}
    value_reads = {str:set()}
    indexed_values = {kind:set() for kind in (list,tuple)}
    counted_values = {kind:set() for kind in (list,set)}
    collection_uses, conditional_actions, method_calls = set(), set(), set()
    method_functions = {}
    numeric_values, handled_value_errors = set(), set()
    output_size, print_calls, output_text = 0, 0, ''
    output_error = None
    # A fresh namespace must also isolate public attributes of imported modules.
    lesson_math = type(math)('math')
    lesson_math.__dict__.update(math.__dict__)
    lesson_ceil = math.ceil
    lesson_floor = math.floor
    def source_snapshot(value):
        # Record small ordinary values, never retain player objects or invoke
        # their conversion/iteration hooks while collecting lesson evidence.
        if type(value) in (int,float,bool,type(None)): return value
        if type(value) is str: return value if len(value)<=8192 else None
        if type(value) in (list,tuple,set) and len(value)<=128 and all(type(item) in (int,float,str,bool,type(None)) for item in value):
            return type(value)(source_snapshot(item) for item in value)
        return None
    code = payload['code']
    try:
        if len(code) > 16000: raise ValueError('โค้ดยาวเกินไป ลองแยกให้สั้นลง')
        tree = ast.parse(code, '<player>')
        nodes = list(ast.walk(tree))
        if len(nodes) > 2500: raise ValueError('โค้ดซับซ้อนเกินไปสำหรับห้องนี้')
        marker = '_runecode_mark'
        branch_marker = '_runecode_branches'
        origin_marker = '_runecode_origins'
        for index, node in enumerate(nodes):
            node._lesson_id = index
            if any(name in (getattr(node,'name',None), getattr(node,'arg',None), getattr(node,'asname',None), getattr(node,'rest',None)) for name in (marker,branch_marker,origin_marker)):
                raise ValueError('ชื่อนี้สงวนไว้สำหรับเกม ลองตั้งชื่ออื่น')
            if isinstance(node, (ast.ImportFrom, ast.Global, ast.Nonlocal, ast.Delete, ast.AsyncFunctionDef, ast.Await)):
                raise ValueError('โจทย์นี้ยังไม่ใช้คำสั่งนี้ ลองใช้เครื่องมือในสมุดบทเรียน')
            if isinstance(node, ast.Import) and any(a.name != 'math' for a in node.names):
                raise ValueError('เกมนี้อนุญาตให้นำเข้าเฉพาะโมดูล math')
            if isinstance(node, ast.Name) and (node.id.startswith('_') or node.id in ('eval','exec','open','input','compile','globals','locals','getattr','setattr','vars','breakpoint')):
                raise ValueError('คำสั่งนี้ไม่อยู่ในเครื่องมือของบทเรียน')
            if isinstance(node, ast.Attribute) and node.attr.startswith('_'):
                raise ValueError('ใช้เฉพาะคุณสมบัติและเมธอดสาธารณะของ object')
        method_owners = {f._lesson_id:c._lesson_id for c in nodes if isinstance(c,ast.ClassDef) for f in c.body if isinstance(f,ast.FunctionDef) and not f.name.startswith('_')}
        def emit(kind, skill=None, power=None):
            frames = traceback.extract_stack(limit=32)
            line = next((frame.lineno for frame in reversed(frames) if frame.filename=='<player>'),1)
            entry = {'kind':kind,'line':line}
            if skill is not None: entry['skill'] = skill
            if power is not None: entry['power'] = power
            loops = [n for n in nodes if isinstance(n,(ast.For,ast.While)) and any(frame.filename=='<player>' and n.lineno <= frame.lineno <= n.end_lineno for frame in frames)]
            if loops: entry['loopLine'] = max(loops,key=lambda n:n.lineno).lineno
            if len(trace)<4: trace.append(entry)
            if len(actions) >= 3: raise ValueError('ออกคำสั่งเกิน 3 ครั้ง ลองลดจำนวนรอบหรือคำสั่ง')
            action = {'kind':kind}
            if skill is not None: action['skill'] = skill
            if power is not None: action['power'] = power
            actions.append(action)
            # Only frames currently executing a branch can control this command.
            # Suspended generators keep their local markers but are not callers.
            frame = sys._getframe(1)
            branches = set()
            while frame is not None:
                if frame.f_code.co_filename == '<player>':
                    branches.update(frame.f_locals.get(branch_marker,()))
                frame = frame.f_back
            conditional_actions.update(index for index in branches if isinstance(nodes[index],ast.If))
            call_id = active_commands[-1] if active_commands else None
            call_node = nodes[call_id] if call_id is not None else None
            argument = (call_node.args[0] if call_node.args else call_node.keywords[0].value if call_node.keywords else None) if call_node is not None else None
            origins = expression_sources.get(argument._lesson_id,{argument._lesson_id}).copy() if argument is not None else set()
            action_evidence.append({'call':call_id,'branches':branches,'print_calls':print_calls,'printed_calls':successful_prints.copy(),'prints':source_print_events[:],'output':output[:3],'origins':origins,'returns':returned_values.copy(),'return_origins':{key:value.copy() for key,value in call_return_sources.items()},'numbers':actual_numbers.copy(),'values':source_values.copy(),'calls':source_calls.copy(),'indexes':source_indexes.copy(),'assignments':assignment_events[:],'scope':{name:source_snapshot(value) for name,value in scope.items()},'executed':executed.copy(),'entered':entered.copy(),'sources':{key:value.copy() for key,value in expression_sources.items()},'divisions':division_errors.copy(),'handled_divisions':handled_divisions.copy(),'instances':instance_classes.copy(),'constructed':constructed.copy(),'methods':method_calls.copy(),'functions':function_calls.copy(),'offensive_names':{name for name,value in scope.items() if type(value) is types.FunctionType and value in command_functions and command_kinds[value] in ('attack','skill')}})
        def command(kind, skill=None):
            def action(*args, **kwargs):
                label = skill if skill is not None else kind
                if kind not in ('attack','skill'):
                    if args or kwargs: raise TypeError(label+'() ไม่รับค่าในวงเล็บ ลองใช้ '+label+'()')
                    emit(kind,skill)
                    return
                if len(args)>1 or any(key!='power' for key in kwargs) or args and kwargs:
                    raise TypeError(label+'() รับพลังหนึ่งค่า เช่น '+label+'(2) หรือไม่ใส่ค่าเพื่อใช้พลัง 1')
                power = args[0] if args else kwargs.get('power',1)
                if type(power) is not int or not 1<=power<=3:
                    raise ValueError('พลังต้องเป็นจำนวนเต็ม 1 ถึง 3 เช่น '+label+'(2) ไม่ใช่จำนวน AP')
                emit(kind,skill,power if args or kwargs else None)
            command_functions.add(action)
            command_kinds[action] = kind
            return action
        def show(*items, sep=' ', end='\n', flush=False):
            nonlocal output_size, print_calls, output_text, output_error
            printed = io.StringIO()
            print(*items, sep=sep, end=end, flush=flush, file=printed)
            text = printed.getvalue()
            if print_calls>=128 or output_size+len(text)>8192:
                output_error = ValueError('ผลพิมพ์มากเกินไป (สูงสุด 128 ครั้งหรือ 8,192 ตัวอักษร) ลองลดจำนวนรอบ')
                raise output_error
            print_calls += 1
            print_texts.append(text)
            output_size += len(text)
            output_text += text
            display = output_text[:-1] if output_text.endswith('\n') else output_text
            # Bound rendered blocks too; embedded newlines remain real text.
            output[:] = display.split('\n', 127)
        def allowed_import(name, *args, **kwargs):
            if name != 'math': raise ValueError('นำเข้าได้เฉพาะ math')
            return lesson_math
        # Keep the original AST for lesson structure. Only a separate executable
        # copy receives markers; line events cannot distinguish dead expressions
        # and one-line function bodies from the statement containing them.
        def mark(index, value=None, entry=False, operation=None):
            if operation=='scope': return set()
            if operation=='origins': return {}
            if operation=='branch-enter':
                value.add(index)
                return
            if operation=='branch-exit':
                value.discard(index)
                return
            if operation=='slice': return slice(*value)
            if operation=='divide':
                def divide(right):
                    try: return value / right
                    except ZeroDivisionError as error:
                        if source_exercise is not None:
                            division_errors[index] = (source_snapshot(value),source_snapshot(right))
                            error._runecode_division = index
                        raise
                return divide
            if operation=='index':
                def read(key):
                    result = value[key]
                    if source_exercise is not None: source_indexes[index] = {'value':source_snapshot(value),'key':source_snapshot(key)}
                    collection_uses.add(index)
                    for kind, reads in indexed_values.items():
                        if issubclass(type(value),kind): reads.add(index)
                    return result
                return read
            if operation=='call':
                # Keep ordinary calls untouched. Source exercises additionally
                # record the real callable and the active game-call site, so a
                # disconnected AST example cannot supply the emitted power.
                game_call = type(value) is types.FunctionType and value in command_functions
                source_function = source_exercise is not None and type(value) is types.FunctionType and value.__code__ in function_definitions
                observed_builtins = ((sum,'sum'),(range,'range'),(lesson_ceil,'ceil'),(lesson_floor,'floor'),(int,'int'),(len,'len'),(set,'set'),(max,'max'),(min,'min'))
                builtin_name = next((name for builtin,name in observed_builtins if value is builtin),None) if source_exercise is not None else None
                source_builtin = builtin_name is not None
                source_print = source_exercise is not None and value is show
                if not game_call and not source_function and not source_builtin and not source_print and value is not len and type(value) is not types.MethodType: return value
                def invoke(*args, **kwargs):
                    if game_call: active_commands.append(index)
                    try:
                        result = value(*args, **kwargs)
                    finally:
                        if game_call: active_commands.pop()
                    if source_function:
                        function_calls[index] = function_definitions[value.__code__]
                        returned_values[index] = result if type(result) in (int,float) else None
                        call_return_sources[index] = function_return_sources.get(value.__code__,set()).copy()
                        source_calls[index] = {'name':'function','args':tuple(source_snapshot(arg) for arg in args),'kwargs':{name:source_snapshot(arg) for name,arg in kwargs.items()}}
                    if source_print:
                        successful_prints.add(index)
                        source_print_events.append((index,print_texts[-1]))
                    if source_builtin or source_print:
                        observation = {'name':'print' if source_print else builtin_name,'args':tuple(source_snapshot(arg) for arg in args),'kwargs':{name:source_snapshot(arg) for name,arg in kwargs.items()}}
                        if value is range: observation['range'] = (result.start,result.stop,result.step)
                        source_calls[index] = observation
                    # Inspect the actual builtin and its actual argument, not a
                    # list/set name nested inside an unrelated expression.
                    if value is len:
                        collection_uses.add(index)
                        for kind, reads in counted_values.items():
                            if args and issubclass(type(args[0]),kind): reads.add(index)
                    if type(value) is types.MethodType:
                        definition = method_functions.get(value.__func__.__code__)
                        owner = method_owners.get(definition)
                        cls = class_values.get(owner)
                        bases = type.__getattribute__(type(value.__self__),'__mro__')
                        if cls is not None and any(base is cls for base in bases) and definition in entered:
                            method_calls.add(definition)
                            function_calls[index] = definition
                            returned_values[index] = result if type(result) in (int,float) else None
                            call_return_sources[index] = function_return_sources.get(value.__func__.__code__,set()).copy()
                    return result
                return invoke
            if entry: entered.add(index)
            else:
                executed.add(index)
                if value is lesson_math: math_reads.add(index)
                if issubclass(type(value),(int,float)) and not issubclass(type(value),bool):
                    numeric_values.add(index)
                    if source_exercise is not None: actual_numbers[index] = value if type(value) in (int,float) else None
                if isinstance(nodes[index],ast.ExceptHandler) and issubclass(type(sys.exception()),ValueError): handled_value_errors.add(index)
                if isinstance(nodes[index],ast.ExceptHandler) and issubclass(type(sys.exception()),ZeroDivisionError): handled_divisions[index] = getattr(sys.exception(),'_runecode_division',None)
                if isinstance(nodes[index],ast.Name):
                    # Observe real values without invoking a player's attribute
                    # hooks. Store only bounded AST IDs, never player objects.
                    for kind, reads in value_reads.items():
                        if issubclass(type(value),kind): reads.add(index)
                if isinstance(nodes[index],ast.ClassDef): class_values[index] = value
                if isinstance(nodes[index],ast.FunctionDef) and type(value) is types.FunctionType:
                    function_definitions[value.__code__] = index
                if index in method_owners and type(value) is types.FunctionType:
                    method_functions[value.__code__] = index
                for definition, cls in class_values.items():
                    if type(value) is cls:
                        instances.add(index)
                        instance_classes[index] = definition
                        if isinstance(nodes[index],ast.Call): constructed.add(definition)
                if source_exercise is not None:
                    # Bounded provenance for ordinary assignments. Store AST IDs,
                    # not player objects; replacing a value replaces its origins.
                    node = nodes[index]
                    frame = sys._getframe(1)
                    local_origins = frame.f_locals.get(origin_marker,{})
                    if isinstance(node,ast.expr): source_values[index] = source_snapshot(value)
                    if isinstance(node,ast.Name) and isinstance(node.ctx,ast.Load):
                        origin_scope = local_origins if node.id in frame.f_locals else frame.f_globals.get(origin_marker,{})
                        expression_sources[index] = {index} | origin_scope.get(node.id,set())
                    elif isinstance(node,ast.expr):
                        expression_sources[index] = {index}
                        for child in ast.iter_child_nodes(node):
                            expression_sources[index].update(expression_sources.get(child._lesson_id,set()))
                        expression_sources[index].update(call_return_sources.get(index,set()))
                    elif isinstance(node,ast.Return):
                        function_return_sources[frame.f_code] = expression_sources.get(node.value._lesson_id,{node.value._lesson_id}).copy() if node.value is not None else set()
                    elif isinstance(node,(ast.Assign,ast.AnnAssign,ast.AugAssign)):
                        targets = node.targets if isinstance(node,ast.Assign) else [node.target]
                        origins = {index} | (expression_sources.get(node.value._lesson_id,{node.value._lesson_id}).copy() if node.value is not None else set())
                        for target in targets:
                            if isinstance(target,ast.Name):
                                if isinstance(node,ast.AugAssign): origins |= local_origins.get(target.id,set())
                                local_origins[target.id] = origins.copy()
                                if len(assignment_events)<4096: assignment_events.append((index,target.id,source_snapshot(frame.f_locals.get(target.id))))
                            else:
                                for name in ast.walk(target):
                                    if isinstance(name,ast.Name) and isinstance(name.ctx,ast.Store): local_origins.pop(name.id,None)
            return value
        class Evidence(ast.NodeTransformer):
            def wrap(self, node, value, operation=None):
                call = ast.Call(func=ast.Name(id=marker,ctx=ast.Load()),args=[ast.Constant(node._lesson_id),value],keywords=[])
                if operation is not None: call.keywords.append(ast.keyword(arg='operation',value=ast.Constant(operation)))
                return ast.copy_location(call,node)
            def statement(self, node, entry=False, value=None, operation=None):
                call = self.wrap(node,value if value is not None else ast.Constant(None),operation)
                if entry: call.keywords = [ast.keyword(arg='entry',value=ast.Constant(True))]
                return ast.copy_location(ast.Expr(value=call),node)
            def scope(self, node):
                return ast.copy_location(ast.Assign(targets=[ast.Name(id=branch_marker,ctx=ast.Store())],value=self.wrap(node,ast.Constant(None),'scope')),node)
            def origins(self, node):
                return ast.copy_location(ast.Assign(targets=[ast.Name(id=origin_marker,ctx=ast.Store())],value=self.wrap(node,ast.Constant(None),'origins')),node)
            def branch(self, node, body):
                if not body: return body
                value = ast.Name(id=branch_marker,ctx=ast.Load())
                guarded = ast.Try(body=[self.statement(node,value=value,operation='branch-enter'),*body],handlers=[],orelse=[],finalbody=[self.statement(node,value=ast.Name(id=branch_marker,ctx=ast.Load()),operation='branch-exit')])
                return [ast.copy_location(guarded,node)]
            def slice(self, node):
                if isinstance(node,ast.Slice):
                    parts = ast.Tuple(elts=[part if part is not None else ast.Constant(None) for part in (node.lower,node.upper,node.step)],ctx=ast.Load())
                    return self.wrap(node,parts,'slice')
                if isinstance(node,ast.Tuple):
                    node.elts = [self.slice(part) for part in node.elts]
                return node
            def visit(self, node):
                node = super().visit(node)
                if isinstance(node,ast.Slice): return self.slice(node)
                if isinstance(node,ast.FunctionDef):
                    # Preserve the first literal as a real Python docstring.
                    offset = int(bool(node.body) and isinstance(node.body[0],ast.Expr) and isinstance(node.body[0].value,ast.Constant) and isinstance(node.body[0].value.value,str))
                    node.body[offset:offset] = [self.scope(node),self.origins(node),self.statement(node,entry=True)]
                    return [node,self.statement(node,value=ast.Name(id=node.name,ctx=ast.Load()))]
                if isinstance(node,ast.ClassDef):
                    offset = int(bool(node.body) and isinstance(node.body[0],ast.Expr) and isinstance(node.body[0].value,ast.Constant) and isinstance(node.body[0].value.value,str))
                    node.body.insert(offset,self.scope(node))
                    node.body.insert(offset+1,self.origins(node))
                    return [node,self.statement(node,value=ast.Name(id=node.name,ctx=ast.Load()))]
                if isinstance(node,(ast.Assign,ast.AnnAssign,ast.AugAssign,ast.Import)):
                    return [node,self.statement(node)]
                if isinstance(node,(ast.If,ast.For,ast.While,ast.Try)):
                    if isinstance(node,ast.If):
                        node.body = self.branch(node,node.body)
                        node.orelse = self.branch(node,node.orelse)
                    if isinstance(node,(ast.For,ast.While)):
                        # A loop declaration whose body never runs is not practice.
                        # This also accepts finite loops stopped with break.
                        node.body.insert(0,self.statement(node,entry=True))
                    return [self.statement(node),node]
                if isinstance(node,ast.ExceptHandler):
                    node.body = self.branch(node,[self.statement(node),*node.body])
                if isinstance(node,ast.Return):
                    node.value = self.wrap(node,node.value if node.value is not None else ast.Constant(None))
                if isinstance(node,ast.Call):
                    node.func = self.wrap(node,node.func,'call')
                if isinstance(node,ast.Subscript) and isinstance(node.ctx,ast.Load):
                    read = ast.copy_location(ast.Call(func=self.wrap(node,node.value,'index'),args=[self.slice(node.slice)],keywords=[]),node)
                    return self.wrap(node,read)
                if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Div):
                    divide = ast.copy_location(ast.Call(func=self.wrap(node,node.left,'divide'),args=[node.right],keywords=[]),node)
                    return self.wrap(node,divide)
                if isinstance(node,(ast.Call,ast.BinOp,ast.Set)) or isinstance(node,(ast.Name,ast.Attribute,ast.List,ast.Tuple)) and isinstance(node.ctx,ast.Load):
                    return self.wrap(node,node)
                return node
        executable = ast.fix_missing_locations(Evidence().visit(copy.deepcopy(tree)))
        builtins = {'__build_class__':__build_class__, '__import__':allowed_import, 'object':object,'range':range,'len':len,'sum':sum,'min':min,'max':max,'abs':abs,'round':round,'enumerate':enumerate,'zip':zip,'sorted':sorted,'reversed':reversed,'str':str,'int':int,'float':float,'bool':bool,'list':list,'tuple':tuple,'set':set,'dict':dict,'ValueError':ValueError,'TypeError':TypeError,'ZeroDivisionError':ZeroDivisionError,'Exception':Exception}
        scope = {'__builtins__':builtins,'__name__':'player','print':show,**{name:command(name) for name in ('attack','defend','skill','heal','focus')},**payload['context'],marker:mark,branch_marker:set(),origin_marker:{}}
        scope.update({name:command('skill',name) for name in ('pierce','stun','burst')})
        exec(compile(executable,'<player>','exec'),scope)
        if output_error is not None: raise output_error
        if len(trace)>3: raise ValueError('ออกคำสั่งเกิน 3 ครั้ง ลองลดจำนวนรอบหรือคำสั่ง')
        active = [n for n in nodes if n._lesson_id in executed]
        def has(kind): return any(isinstance(n,kind) for n in active)
        def called(name): return any(isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id==name for n in active)
        assignments = [n for n in active if isinstance(n,(ast.Assign,ast.AnnAssign)) and n.value is not None]
        assigned_names = {t.id for n in assignments for target in (n.targets if isinstance(n,ast.Assign) else [n.target]) for t in ast.walk(target) if isinstance(t,ast.Name) and isinstance(t.ctx,ast.Store)}
        def indexes_value(kind):
            return bool(indexed_values[kind])
        def counts_value(kind):
            return bool(counted_values[kind])
        functions = [n for n in active if isinstance(n,ast.FunctionDef)]
        def returns(node):
            for child in ast.iter_child_nodes(node):
                if isinstance(child,(ast.FunctionDef,ast.ClassDef,ast.Lambda)): continue
                if isinstance(child,ast.Return): yield child
                yield from returns(child)
        checks = {
          'print': bool(output) and called('print'),
          # Count actual successful calls, not AP, AST occurrences or output lines.
          # A print followed by one skill teaches order without forcing spare AP.
          'sequence': print_calls + len(actions)>=2,
          'comment': any(t.type==tokenize.COMMENT for t in tokenize.generate_tokens(io.StringIO(code).readline)),
          'variable': any(isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load) and n.id in assigned_names and n._lesson_id in numeric_values for n in active),
          'string': any(isinstance(c,ast.Call) and isinstance(c.func,ast.Name) and c.func.id=='print' and any(isinstance(x,ast.Name) and x._lesson_id in value_reads[str] and x.id in assigned_names for x in ast.walk(c)) for c in active),
          'arithmetic': any(isinstance(n,ast.BinOp) and n._lesson_id in numeric_values for n in active) and (bool(output) or source_exercise is not None),
          'list': indexes_value(list) or counts_value(list),
          'tuple': indexes_value(tuple),
          'set': counts_value(set),
          'if': bool(conditional_actions),
          'for':any(isinstance(n,ast.For) and n._lesson_id in entered for n in active),
          'while':any(isinstance(n,ast.While) and n._lesson_id in entered for n in active),
          'function': any(n._lesson_id in entered for n in functions),
          'parameter': any((n.args.args or n.args.posonlyargs or n.args.kwonlyargs) and n._lesson_id in entered and any(r._lesson_id in executed for r in returns(n)) for n in functions),
          'math': has(ast.Import) and any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.value._lesson_id in math_reads for n in active),
          'class': bool(constructed) and any(isinstance(n,ast.Attribute) and n.value._lesson_id in instances for n in active),
          'method': bool(method_calls),
          'exception': has(ast.Try) and bool(handled_value_errors or handled_divisions)
        }
        missing = [c for c in payload['contract']['concepts'] if not checks.get(c,False)]
        if missing:
            guides = {
              'print':'เรียก print() เพื่อแสดงข้อความ แล้วเลือกคำสั่งต่อสู้ของคุณ',
              'sequence':'เรียก print() หรือคำสั่งต่อสู้รวมอย่างน้อยสองครั้ง เช่น print() บอกแผน แล้ว attack() หรือ skill() หนึ่งครั้ง โดย print() ไม่เสีย AP และต้องมีคำสั่งต่อสู้อย่างน้อยหนึ่งครั้ง',
              'comment':'เพิ่มคอมเมนต์ด้วย # เพื่ออธิบายแผน โดยเขียนคำสั่งต่อสู้ในบรรทัดถัดไป',
              'variable':'กำหนดค่าตัวเลขให้ตัวแปรด้วย = แล้วอ่านค่าผ่านชื่อนั้น การระบุชนิดอย่างเดียวไม่ใช่การกำหนดค่า',
              'string':'เก็บข้อความในตัวแปร แล้วส่งชื่อตัวแปรให้ print() โดยไม่ใส่คำพูดรอบชื่อ',
              'arithmetic':'คำนวณระหว่างตัวเลขด้วยตัวดำเนินการ เช่น + หรือ - แล้วนำผลลัพธ์ไปใช้ตามภารกิจ',
              'list':'สร้าง list แล้วอ่านสมาชิกด้วย [ดัชนี] หรือส่ง list ให้ len() ตรวจจำนวนสมาชิก',
              'tuple':'สร้าง tuple แล้วอ่านสมาชิกด้วย [ดัชนี] โดยดัชนีเริ่มจาก 0',
              'set':'สร้าง set แล้วใช้ len() กับ set นั้นเพื่อนับสมาชิกที่ไม่ซ้ำ',
              'if':'เพิ่ม if พร้อมเงื่อนไข แล้วเรียกคำสั่งต่อสู้ในบล็อกที่เลือก',
              'for':'ใช้ for วนซ้ำผ่านข้อมูลหรือ range() ให้บล็อกทำงานอย่างน้อยหนึ่งรอบ และตรวจ AP รวมก่อนรัน',
              'while':'ใช้ while พร้อมเงื่อนไขหยุด ให้บล็อกทำงานอย่างน้อยหนึ่งรอบ แล้วหยุดด้วยการเปลี่ยนค่าหรือ break',
              'function':'สร้างฟังก์ชันด้วย def แล้วเรียกใช้งาน การประกาศอย่างเดียวยังไม่รันบอดี',
              'parameter':'สร้างฟังก์ชันที่รับพารามิเตอร์ มี return ส่งค่า แล้วเรียกฟังก์ชันพร้อมส่งค่าเข้าไป',
              'math':'นำเข้า math แล้วเรียกฟังก์ชันของโมดูล เช่น math.ceil() โดยส่งค่าที่ต้องการคำนวณ',
              'class':'สร้าง class และ object จาก class นั้น แล้วอ่านคุณสมบัติผ่าน object',
              'method':'สร้างเมธอดใน class แล้วเรียกผ่าน object เมธอดเริ่มต้นอย่างเดียวยังไม่ใช่ท่าที่เรียกใช้',
              'exception':'ใช้ try/except รับมือข้อผิดพลาด ValueError หรือ ZeroDivisionError ที่เกิดขึ้นจริง แล้วให้โปรแกรมทำงานต่อในบล็อก except'
            }
            concept, related = missing[0], None
            guide = guides.get(concept,'ลองอ่านภารกิจและคำใบ้ แล้วนำแนวคิดมาใช้ในโค้ดที่ทำงานจริง')
            if concept=='variable':
                related = next((n for n in active if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load) and n.id in assigned_names),None)
            elif concept=='arithmetic':
                related = next((n for n in active if isinstance(n,ast.BinOp)),None)
            elif concept=='if':
                related = next((n for n in active if isinstance(n,ast.If)),None)
                if related is not None:
                    guide = 'พบ if แล้ว แต่ยังไม่มีคำสั่งต่อสู้ทำงานในบล็อกที่เลือก ลองเรียกคำสั่งหรือฟังก์ชันแผนภายใน if/else'
            elif concept in ('for','while'):
                related = next((n for n in active if isinstance(n,ast.For if concept=='for' else ast.While)),None)
            elif concept=='exception':
                related = next((n for n in active if isinstance(n,ast.ExceptHandler)),None)
            elif concept=='function' and functions:
                related = functions[0]
                guide = 'ประกาศฟังก์ชันแล้ว แต่บอดียังไม่ถูกเรียก ลองเรียกชื่อฟังก์ชันตามด้วย () หรือเรียกผ่านชื่ออื่นที่อ้างถึงฟังก์ชันนั้น'
            elif concept=='parameter' and functions:
                parameterized = [f for f in functions if f.args.args or f.args.posonlyargs or f.args.kwonlyargs]
                related = next((f for f in parameterized if f._lesson_id in entered),None) or next(iter(parameterized),functions[0])
                if not parameterized:
                    guide = 'ฟังก์ชันที่ประกาศยังไม่มีพารามิเตอร์ ลองเพิ่มชื่อรับค่าในวงเล็บ ใช้ return ส่งผล และเรียกพร้อมส่งค่า'
                elif related._lesson_id not in entered:
                    guide = 'ฟังก์ชันรับพารามิเตอร์แล้ว แต่ยังไม่ถูกเรียก ลองส่งค่าเข้าไป และใช้ return ส่งผลกลับ'
                else:
                    pending_returns = list(returns(related))
                    if pending_returns:
                        related = pending_returns[0]
                        guide = 'return ยังไม่ทำงานในฟังก์ชันที่รับพารามิเตอร์ ลองตรวจเงื่อนไขก่อน return และค่าที่ส่งเข้าไป'
                    else:
                        guide = 'ฟังก์ชันที่เรียกยังไม่มี return ส่งค่ากลับ ลองคืนผลที่คำนวณจากพารามิเตอร์'
            elif concept=='math':
                related = next((n for n in active if isinstance(n,ast.Import)),None)
                if related is not None:
                    guide = 'นำเข้า math แล้ว แต่ยังไม่พบการเรียกฟังก์ชันของมัน ลองเรียกผ่านชื่อที่นำเข้า และตรวจว่าชื่อนั้นไม่ถูกกำหนดค่าใหม่'
            elif concept=='class':
                related = next((n for n in active if isinstance(n,ast.ClassDef) and n._lesson_id in constructed),None) or next((n for n in active if isinstance(n,ast.ClassDef)),None)
                if related is not None:
                    guide = 'สร้าง object แล้ว ลองอ่านคุณสมบัติผ่าน object ที่สร้างจาก class นี้' if related._lesson_id in constructed else 'ประกาศ class แล้ว ลองสร้าง object จาก class นี้ จากนั้นอ่านคุณสมบัติผ่าน object'
            elif concept=='method':
                related = next((f for c in active if isinstance(c,ast.ClassDef) for f in c.body if isinstance(f,ast.FunctionDef) and not f.name.startswith('_')),None)
                if related is not None:
                    guide = 'เมธอดยังไม่ถูกเรียกผ่าน object ลองสร้าง object แล้วเรียก object.ชื่อเมธอด() หรือเรียกผ่านชื่ออื่นที่อ้างถึงเมธอดนั้น'
            elif concept in ('string','list','tuple','set'):
                # A direct, actually read variable is a useful place to inspect.
                # Do not invent a location for absent or unreachable evidence,
                # or pretend this limited checker tracks arbitrary dataflow.
                for candidate in active:
                    reads = []
                    if concept in ('list','tuple') and isinstance(candidate,ast.Subscript): reads = [candidate.value]
                    elif isinstance(candidate,ast.Call) and isinstance(candidate.func,ast.Name) and candidate.func.id==('print' if concept=='string' else 'len'):
                        reads = candidate.args
                    if any(isinstance(r,ast.Name) and r._lesson_id in executed and r.id in assigned_names for r in reads):
                        related = candidate
                        guide = 'ตัวแปรที่ส่งให้ print() ต้องเก็บข้อความ ลองตรวจค่าที่กำหนดก่อนบรรทัดนี้' if concept=='string' else 'ค่าที่อ่านต้องเป็น '+concept+' ลองตรวจชนิดข้อมูลที่กำหนดให้ตัวแปรก่อนบรรทัดนี้'
                        break
                if concept in ('list','tuple','set') and related is None:
                    related = next((n for n in active if n._lesson_id in collection_uses and (isinstance(n,ast.Subscript) if concept=='tuple' else True)),None)
                    if related is not None:
                        guide = 'ค่าที่อ่านต้องเป็น '+concept+' ลองตรวจชนิดข้อมูลที่ใช้กับดัชนีหรือส่งให้ len() โดยตรง'
            error = ValueError('ยังไม่พบการใช้แนวคิด '+', '.join(missing)+' ตามภารกิจ · '+guide)
            error.lineno = related.lineno if related is not None else None
            raise error
${SOURCE_EXERCISE_VALIDATION}
        if not actions: raise ValueError('ยังไม่มีคำสั่งต่อสู้ ลองเลือกคำสั่งจากแผงสกิลฝั่งผู้เล่น')
        return {'ok':True,'actions':actions,'stdout':output,'trace':trace}
    except Exception as err:
        line = getattr(err,'lineno',None)
        frames = traceback.extract_tb(err.__traceback__)
        for frame in frames:
            if frame.filename=='<player>': line=frame.lineno
        kind = type(err).__name__
        prefixes={'SyntaxError':'รูปแบบโค้ดยังไม่ถูก ลองตรวจวงเล็บ เครื่องหมายคำพูด และ :','IndentationError':'การย่อหน้ายังไม่ถูก ใช้ 4 ช่องภายในบล็อก','TabError':'การย่อหน้าปนแท็บกับช่องว่าง ลองใช้ช่องว่าง 4 ช่องให้เหมือนกันทั้งบล็อก','NameError':'ยังไม่รู้จักชื่อนี้ ตรวจการสะกดและกำหนดค่าก่อนใช้','TypeError':'ชนิดข้อมูลหรือจำนวนพารามิเตอร์ไม่ตรง ลองดูคู่มือคำสั่ง','ZeroDivisionError':'หารด้วยศูนย์ไม่ได้ ลองตรวจตัวหาร','IndexError':'ดัชนีอยู่นอกขอบเขตข้อมูล ดัชนีเริ่มจาก 0 ลองใช้ len() ตรวจจำนวนสมาชิกก่อนอ่าน','AttributeError':'ค่านี้ไม่มีคุณสมบัติหรือเมธอดที่เรียก ตรวจการสะกดและชนิดข้อมูลก่อนจุด .','KeyError':'ไม่พบกุญแจนี้ใน dict ลองตรวจชื่อกุญแจหรืออ่านด้วย get()','OverflowError':'ตัวเลขใหญ่เกินช่วงที่ฟังก์ชันนี้รองรับ ลองลดค่าที่ส่งเข้าไป','RecursionError':'โค้ดซ้อนหรือเรียกซ้ำลึกเกินไป ลองลดความลึกหรือเพิ่มเงื่อนไขหยุด'}
        # Builtin/user value failures end in player code. Keep the game's own
        # Thai validation/action/output guards distinct from conversion errors.
        if kind=='ValueError' and frames and (frames[-1].filename=='<player>' or frames[-1].name in ('invoke','read')):
            prefixes[kind] = 'ค่าที่ส่งให้ฟังก์ชันใช้ไม่ได้ ลองตรวจช่วงค่าหรือข้อความที่แปลงเป็นตัวเลข'
        message = prefixes.get(kind,str(err))
        if kind in prefixes: message += ' · '+str(err).split('\n')[0][:180]
        return {'ok':False,'actions':[],'stdout':output,'trace':trace,'traceLimited':len(trace)>3,'diagnostic':{'kind':kind,'message':message,'line':line}}

json.dumps(_evaluate(json.loads(_payload)), ensure_ascii=False)
`;
