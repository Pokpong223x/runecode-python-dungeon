/** Inserted inside _evaluate's try block, after the generic concept checks. */
export const SOURCE_EXERCISE_VALIDATION = String.raw`
        cid = payload['contract'].get('sourceExercise')
        if cid is not None:
            expected_powers = [1,2,1,3,2,3,2,3,2,1,3,2,3,2,2,3,2,2]
            offense = [(i,a) for i,a in enumerate(actions) if a.get('kind') in ('attack','skill')]
            source_line = None
            def source_need(ok, message):
                if not ok:
                    error = ValueError('Exercise '+str(cid)+' · '+message)
                    error.lineno = source_line
                    raise error
            source_need(type(cid) is int and 1 <= cid <= len(expected_powers), 'Reopen this room from the map.')
            source_need(len(offense)==1, 'Use one attack or skill per plan.')
            action_index, source_action = offense[0]
            evidence = action_evidence[action_index]
            call_id = evidence.get('call')
            source_need(type(call_id) is int and 0 <= call_id < len(nodes) and isinstance(nodes[call_id],ast.Call), 'Add one attack or skill.')
            source_call = nodes[call_id]
            source_line = source_call.lineno
            power_expression = None
            if len(source_call.args)==1 and not source_call.keywords:
                power_expression = source_call.args[0]
            elif not source_call.args and len(source_call.keywords)==1 and source_call.keywords[0].arg=='power':
                power_expression = source_call.keywords[0].value
            source_need(power_expression is not None, 'Pass power in parentheses, such as attack(1).')
            source_need(source_action.get('power')==expected_powers[cid-1], 'Use power '+str(expected_powers[cid-1])+'.')
            power_ids = {n._lesson_id for n in ast.walk(power_expression)} | evidence['origins']
            power_nodes = [nodes[index] for index in power_ids]
            branches, observed = evidence['branches'], evidence['executed']
            source_active_nodes = [n for n in nodes if n._lesson_id in observed]
            source_functions = [n for n in source_active_nodes if isinstance(n,ast.FunctionDef)]
            def source_equal(value, expected):
                if type(value) is not type(expected): return False
                if type(expected) in (list,tuple): return len(value)==len(expected) and all(source_equal(a,b) for a,b in zip(value,expected))
                if type(expected) is set: return value==expected and all(type(item) is type(next(iter(expected))) for item in value)
                return value==expected
            def source_value(name, expected):
                return source_equal(evidence['scope'].get(name),expected)
            def source_reads(root, name):
                return any(isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load) and n.id==name and n._lesson_id in observed for n in ast.walk(root))
            def source_power_reads(name):
                return any(isinstance(n,ast.Name) and isinstance(n.ctx,ast.Load) and n.id==name and n._lesson_id in observed for n in power_nodes)
            def source_constant(node, value):
                return isinstance(node,ast.Constant) and source_equal(node.value,value)
            def source_actual(node, value):
                return node._lesson_id in observed and source_equal(evidence['values'].get(node._lesson_id),value)
            def source_parts(root):
                identifiers = {n._lesson_id for n in ast.walk(root)} | evidence['sources'].get(root._lesson_id,set())
                return [nodes[index] for index in identifiers]
            def source_contains(root, predicate):
                return any(predicate(n) for n in source_parts(root))
            def source_assigns(node, name):
                targets = node.targets if isinstance(node,ast.Assign) else [node.target] if isinstance(node,(ast.AnnAssign,ast.AugAssign)) else []
                return any(isinstance(t,ast.Name) and t.id==name for t in targets)
            def source_initial(name, value, loop):
                return any(assigned_name==name and source_equal(assigned_value,value) and nodes[index].lineno < loop.lineno for index,assigned_name,assigned_value in evidence['assignments'])
            def source_binary(root, operation, left, right):
                return isinstance(root,ast.BinOp) and isinstance(root.op,operation) and root._lesson_id in observed and left(root.left) and right(root.right)
            def source_numeric(node, value):
                return source_equal(evidence['numbers'].get(node._lesson_id),value)
            def source_builtin(node, name, args=None):
                found = evidence['calls'].get(node._lesson_id,{})
                return found.get('name')==name and (args is None or source_equal(found.get('args'),args))
            def source_function(name, expected):
                return [f for f in source_functions if f.name==name and f._lesson_id in evidence['entered'] and any(evidence['functions'].get(n._lesson_id)==f._lesson_id and source_equal(evidence['returns'].get(n._lesson_id),expected) for n in power_nodes if isinstance(n,ast.Call))]
            def source_return_nodes(definitions, expected):
                identifiers = {f._lesson_id for f in definitions}
                return [nodes[index] for call in power_nodes if isinstance(call,ast.Call) and evidence['functions'].get(call._lesson_id) in identifiers and source_equal(evidence['returns'].get(call._lesson_id),expected) for index in evidence['return_origins'].get(call._lesson_id,set())]
            def source_printed(predicate):
                for node in source_active_nodes:
                    if not isinstance(node,ast.Call) or node._lesson_id not in evidence['printed_calls']: continue
                    ids = set()
                    for argument in node.args:
                        ids |= {n._lesson_id for n in ast.walk(argument)} | evidence['sources'].get(argument._lesson_id,set())
                    if predicate(node,[nodes[index] for index in ids]): return True
                return False
            def source_comparison(test, name, operation, value):
                if not isinstance(test,ast.Compare) or len(test.ops)!=1 or len(test.comparators)!=1: return False
                left, right = test.left, test.comparators[0]
                if isinstance(test.ops[0],operation) and isinstance(left,ast.Name) and left.id==name and left._lesson_id in observed and source_constant(right,value): return True
                reverse = {ast.Gt:ast.Lt,ast.Eq:ast.Eq,ast.NotEq:ast.NotEq}.get(operation)
                return reverse is not None and isinstance(test.ops[0],reverse) and source_constant(left,value) and isinstance(right,ast.Name) and right.id==name and right._lesson_id in observed
            if cid==1:
                source_need(evidence['print_calls']>=1 and evidence['output'][:1]==['Moon Gate'], 'Print Moon Gate before attacking with power 1.')
            elif cid==2:
                has_comment = any(t.type==tokenize.COMMENT for t in tokenize.generate_tokens(io.StringIO(code).readline))
                source_need(has_comment and evidence['print_calls']>=1 and evidence['output'][:1]==['Light'], 'Add a # comment, print Light, then attack with power 2.')
            elif cid==3:
                source_need([text.strip('\n') for _,text in evidence['prints'][:3]]==['3','2','1'] and evidence['output'][:3]==['3','2','1'], 'Print 3, 2, and 1 in three calls, then attack with power 1.')
            elif cid==4:
                source_need(source_value('bolts',3) and source_power_reads('bolts'), 'Set bolts = 3 and attack using bolts.')
            elif cid==5:
                printed_label = source_printed(lambda node,parts: any(isinstance(n,ast.Name) and n.id=='label' and source_actual(n,'Moon') for n in parts))
                source_need(source_value('label','Moon') and printed_label and evidence['output'][:1]==['Moon'], 'Set label = "Moon", print label, then attack with power 2.')
            elif cid==6:
                difference = any(source_binary(n,ast.Sub,lambda left:source_contains(left,lambda part:source_reads(part,'stored')) and source_actual(left,8),lambda right:source_contains(right,lambda part:source_reads(part,'spent')) and source_actual(right,5)) and source_numeric(n,3) for n in power_nodes)
                source_need(source_value('stored',8) and source_value('spent',5) and difference, 'Set stored = 8 and spent = 5. Attack using stored - spent.')
            elif cid==7:
                indexed = any(isinstance(n,ast.Subscript) and source_contains(n.value,lambda part:source_reads(part,'supplies')) and source_equal(evidence['indexes'].get(n._lesson_id,{}).get('value'),[4,7,2]) and source_equal(evidence['indexes'].get(n._lesson_id,{}).get('key'),2) for n in power_nodes)
                source_need(source_value('supplies',[4,7,2]) and indexed, 'Set supplies = [4, 7, 2]. Attack using supplies[2].')
            elif cid==8:
                indexed = any(isinstance(n,ast.Subscript) and source_contains(n.value,lambda part:source_reads(part,'bearings')) and source_equal(evidence['indexes'].get(n._lesson_id,{}).get('value'),(8,5,3)) and source_equal(evidence['indexes'].get(n._lesson_id,{}).get('key'),2) for n in power_nodes)
                source_need(source_value('bearings',(8,5,3)) and indexed, 'Set bearings = (8, 5, 3). Attack using bearings[2].')
            elif cid==9:
                counted = any(source_builtin(n,'len',({'sun','moon'},)) and source_contains(n,lambda part:source_reads(part,'signals')) for n in power_nodes if isinstance(n,ast.Call))
                source_need(source_value('signals',{'sun','moon'}) and counted, 'Put sun and moon in the set signals. Attack using len(signals).')
            elif cid==10:
                checked = any(isinstance(n,ast.If) and n._lesson_id in branches and (source_comparison(n.test,'fuel',ast.Eq,0) or isinstance(n.test,ast.UnaryOp) and isinstance(n.test.op,ast.Not) and isinstance(n.test.operand,ast.Name) and n.test.operand.id=='fuel' and source_actual(n.test.operand,0)) for n in source_active_nodes)
                source_need(source_value('fuel',0) and checked, 'Set fuel = 0. Attack with power 1 inside if fuel == 0.')
            elif cid==11:
                printed_loop = False
                for loop in source_active_nodes:
                    if not isinstance(loop,ast.For) or loop._lesson_id not in evidence['entered'] or not isinstance(loop.target,ast.Name): continue
                    if not any(source_equal(evidence['calls'].get(n._lesson_id,{}).get('range'),(0,2,1)) for n in ast.walk(loop.iter)): continue
                    print_ids = {n._lesson_id for statement in loop.body for n in ast.walk(statement) if isinstance(n,ast.Call) and n._lesson_id in evidence['printed_calls'] and source_contains(n,lambda part:source_reads(part,loop.target.id))}
                    printed_steps = [text.strip('\n') for index,text in evidence['prints'] if index in print_ids]
                    if printed_steps[:2]==['0','1'] and source_call not in list(ast.walk(loop)) and trace[action_index].get('loopLine')!=loop.lineno: printed_loop = True
                source_need(printed_loop and evidence['output'][:2]==['0','1'], 'Use for step in range(2) to print step. Attack with power 3 after the loop.')
            elif cid==12:
                counted_down = False
                for loop in source_active_nodes:
                    if not isinstance(loop,ast.While) or loop._lesson_id not in evidence['entered'] or not source_initial('lock',2,loop): continue
                    condition = source_comparison(loop.test,'lock',ast.Gt,0) or source_comparison(loop.test,'lock',ast.NotEq,0) or isinstance(loop.test,ast.Name) and loop.test.id=='lock' and loop.test._lesson_id in observed
                    if not condition or source_call in list(ast.walk(loop)) or trace[action_index].get('loopLine')==loop.lineno: continue
                    for statement in ast.walk(loop):
                        if statement._lesson_id not in observed or not source_assigns(statement,'lock'): continue
                        subtracts_one = isinstance(statement,ast.AugAssign) and isinstance(statement.op,ast.Sub) and (source_constant(statement.value,1) or source_actual(statement.value,1))
                        assigns_difference = isinstance(statement,(ast.Assign,ast.AnnAssign)) and source_binary(statement.value,ast.Sub,lambda left:source_reads(left,'lock'),lambda right:source_constant(right,1) or source_actual(right,1))
                        reached_zero = any(index==statement._lesson_id and name=='lock' and source_equal(value,0) for index,name,value in evidence['assignments'])
                        if (subtracts_one or assigns_difference) and reached_zero: counted_down = True
                source_need(source_value('lock',0) and counted_down, 'Set lock = 2. While lock > 0, subtract 1. Attack with power 2 after the loop.')
            elif cid==13:
                source_need(bool(source_function('spark',3)), 'Make spark() return 3. Attack using spark().')
            elif cid==14:
                boosts = [f for f in source_function('boost',2) if len(f.args.posonlyargs+f.args.args)==1 and (f.args.posonlyargs+f.args.args)[0].arg=='number']
                called_with_one = any(isinstance(call,ast.Call) and evidence['functions'].get(call._lesson_id) in {f._lesson_id for f in boosts} and (source_equal(evidence['calls'].get(call._lesson_id,{}).get('args'),(1,)) or source_equal(evidence['calls'].get(call._lesson_id,{}).get('kwargs'),{'number':1})) for call in power_nodes)
                def receives_one(node):
                    return source_actual(node,1) and source_contains(node,lambda part:source_reads(part,'number'))
                def adds_one(node):
                    return source_constant(node,1) or source_actual(node,1)
                added = any((source_binary(n,ast.Add,receives_one,adds_one) or source_binary(n,ast.Add,adds_one,receives_one)) and source_numeric(n,2) for n in source_return_nodes(boosts,2))
                source_need(called_with_one and added, 'Make boost(number) return number + 1. Attack using boost(1).')
            elif cid==15:
                source_need(any(source_builtin(n,'floor',(2.9,)) for n in power_nodes if isinstance(n,ast.Call)), 'Import math. Attack using math.floor(2.9).')
            elif cid==16:
                lanterns = {n._lesson_id for n in source_active_nodes if isinstance(n,ast.ClassDef) and n.name=='Lantern' and n._lesson_id in evidence['constructed']}
                attribute = any(isinstance(n,ast.Attribute) and n.attr=='power' and source_numeric(n,3) and evidence['instances'].get(n.value._lesson_id) in lanterns for n in power_nodes)
                source_need(attribute, 'Give class Lantern power = 3. Create an object and attack using its power.')
            elif cid==17:
                releases = {f._lesson_id for c in source_active_nodes if isinstance(c,ast.ClassDef) and c.name=='Spring' and c._lesson_id in evidence['constructed'] for f in c.body if isinstance(f,ast.FunctionDef) and f.name=='release' and f._lesson_id in evidence['methods']}
                called_release = any(isinstance(n,ast.Call) and evidence['functions'].get(n._lesson_id) in releases and source_equal(evidence['returns'].get(n._lesson_id),2) for n in power_nodes)
                source_need(called_release, 'Make Spring.release(self) return 2. Create an object and attack using its release().')
            elif cid==18:
                caught_division = False
                for attempt in source_active_nodes:
                    if not isinstance(attempt,ast.Try): continue
                    divisions = {n._lesson_id for statement in attempt.body for n in ast.walk(statement) if isinstance(n,ast.BinOp) and isinstance(n.op,ast.Div) and source_equal(evidence['divisions'].get(n._lesson_id),(6,0))}
                    for handler in attempt.handlers:
                        catches_zero = handler.type is not None and any(isinstance(n,ast.Name) and n.id=='ZeroDivisionError' for n in ast.walk(handler.type))
                        if handler._lesson_id in branches and catches_zero and evidence['handled_divisions'].get(handler._lesson_id) in divisions: caught_division = True
                source_need(caught_division, 'Try 6 / 0. Catch ZeroDivisionError and attack with power 2 inside except.')
`;
