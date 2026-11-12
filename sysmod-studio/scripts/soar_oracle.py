"""Runs a SysMod agent in real Soar, one robot loop at a time, the way the FRC-Soar bridge does.

Used by scripts/test-behavior.ts to check the reference simulator (behaviorSimulator.ts) against
the real kernel. Each loop:
  1. every command from the previous loop gets ^status complete (the robot carried it out)
  2. the inputs are written to the input link (unchanged values are left alone, as the bridge does)
  3. Soar runs one decision, stopping before the next input phase (soar stop-phase input)
  4. the new commands on the output link are recorded

Usage: python3 soar_oracle.py <Soar bin dir> <request.json>
request.json: {"agent": "/path/agent.soar", "seed": 1, "traces": [[{"attr": value-or-null}, ...], ...]}
  where a value is {"kind": "int"|"float"|"string", "value": ...}
Prints one JSON document: {"traces": [[{"issued": [[name, kind, value]], "selected": [names],
  "end": name-or-null}, ...], ...]}
"""
import json
import re
import sys

sys.path.insert(0, sys.argv[1])
import Python_sml_ClientInterface as sml  # noqa: E402

TOP_SELECTION = re.compile(r"^\s*\d+:\s{4}O: \S+ \((.+)\)\s*$")  # a decision line at the top state
TOP_STACK = re.compile(r"^\s*:\s{4}O: \S+ \((.+)\)\s*$")  # print --stack, the top state's operator

request = json.load(open(sys.argv[2], encoding="utf-8"))
kernel = sml.Kernel.CreateKernelInCurrentThread(True, sml.Kernel.kSuppressListener)
printed = []


def on_print(_id, _data, _agent, message):
    printed.append(message)


def run_trace(index, trace):
    agent = kernel.CreateAgent(f"robot{index}")
    agent.RegisterForPrintEvent(sml.smlEVENT_PRINT, on_print, None)
    agent.ExecuteCommandLine(f"srand {request.get('seed', 1)}")
    if not agent.LoadProductions(request["agent"]):
        raise SystemExit(f"could not load {request['agent']}: {agent.GetLastErrorDescription()}")
    agent.ExecuteCommandLine("soar stop-phase input")
    # Level 1 traces each decision; debug adds rule firings and preferences
    agent.ExecuteCommandLine("trace 5" if request.get("debug") else "trace 1")
    agent.SetBlinkIfNoChange(False)
    # As in the bridge: without change tracking, SML never clears "just added", so a command that
    # stays on the output link would be reported (and delivered) again every loop
    agent.SetOutputLinkChangeTracking(True)
    input_link = agent.GetInputLink()
    parents = {}
    wmes = {}
    done = []
    loops = []

    def parent_of(path):
        node = input_link
        parts = path.split(".")
        for i, part in enumerate(parts[:-1]):
            key = ".".join(parts[: i + 1])
            if key not in parents:
                parents[key] = agent.CreateIdWME(node, part)
            node = parents[key]
        return node, parts[-1]

    def write(path, value):
        old = wmes.get(path)
        if value is None:
            if old is not None:
                agent.DestroyWME(old[0])
                del wmes[path]
            return
        kind, val = value["kind"], value["value"]
        if old is not None and old[1] == kind and old[2] == val:
            return
        if old is not None and old[1] == kind:
            agent.Update(old[0], val if kind == "string" else (int(val) if kind == "int" else float(val)))
        else:
            if old is not None:
                agent.DestroyWME(old[0])
            node, attr = parent_of(path)
            if kind == "int":
                wme = agent.CreateIntWME(node, attr, int(val))
            elif kind == "float":
                wme = agent.CreateFloatWME(node, attr, float(val))
            else:
                wme = agent.CreateStringWME(node, attr, str(val))
            old = (wme,)
        wmes[path] = (old[0], kind, val)

    for inputs in trace:
        for command in done:
            command.AddStatusComplete()
        done = []
        for path, value in inputs.items():
            write(path, value)
        agent.Commit()
        printed.clear()
        agent.RunSelf(1)
        issued = []
        for i in range(agent.GetNumberCommands()):
            command = agent.GetCommand(i)
            state = command.FindByAttribute("state", 0)
            kind = state.GetValueType() if state is not None else "missing"
            kind = "float" if kind == "double" else kind  # SML calls Soar floats doubles
            value = state.GetValueAsString() if state is not None else None
            issued.append([command.GetCommandName(), kind, value])
            done.append(command)
        agent.ClearOutputLinkChanges()
        if request.get("debug"):
            sys.stderr.write(f"--- loop {len(loops)} inputs {inputs}\n{''.join(printed)}\n")
        selected = [m.group(1) for line in "".join(printed).splitlines() if (m := TOP_SELECTION.match(line))]
        stack = agent.ExecuteCommandLine("print --stack")
        end = next((m.group(1) for line in stack.splitlines() if (m := TOP_STACK.match(line))), None)
        loops.append({"issued": issued, "selected": selected, "end": end})
        agent.Commit()
    kernel.DestroyAgent(agent)
    return loops


print(json.dumps({"traces": [run_trace(i, t) for i, t in enumerate(request["traces"])]}))
kernel.Shutdown()
