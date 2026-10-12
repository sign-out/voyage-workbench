"""Lossless JSON document inspection and targeted editing; no script execution."""
from dataclasses import dataclass
import json
import re


MAX_DEPTH = 128
_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")
_RAW_SURROGATE = re.compile("[\ud800-\udfff]")


@dataclass(frozen=True)
class Number:
    """A JSON number retaining its exact spelling, including precision and -0."""
    lexeme: str


@dataclass
class _Node:
    value: object
    start: int
    end: int
    children: object = None


class _Parser:
    def __init__(self, text):
        self.text, self.pos = text, 0

    def fail(self, message):
        raise ValueError(f"{message} at character {self.pos}")

    def ws(self):
        while self.pos < len(self.text) and self.text[self.pos] in " \t\r\n":
            self.pos += 1

    def string(self):
        try:
            value, end = json.JSONDecoder().raw_decode(self.text, self.pos)
        except (ValueError, json.JSONDecodeError):
            self.fail("Invalid JSON string")
        self.pos = end
        return value

    def node(self, depth=0):
        if depth > MAX_DEPTH:
            self.fail(f"JSON nesting exceeds local limit of {MAX_DEPTH}")
        self.ws()
        start = self.pos
        if start >= len(self.text):
            self.fail("Expected JSON value")
        c = self.text[start]
        children = None
        if c == '"':
            value = self.string()
        elif c in "[{":
            is_object = c == "{"
            closer = "}" if is_object else "]"
            value, children = ({}, {}) if is_object else ([], [])
            self.pos += 1
            self.ws()
            if self.pos < len(self.text) and self.text[self.pos] == closer:
                self.pos += 1
                return _Node(value, start, self.pos, children)
            while True:
                self.ws()
                if is_object:
                    if self.pos >= len(self.text) or self.text[self.pos] != '"':
                        self.fail("Expected object key")
                    key = self.string()
                    if key in value:
                        self.fail(f"Duplicate object key {key!r}")
                    self.ws()
                    if self.pos >= len(self.text) or self.text[self.pos] != ":":
                        self.fail("Expected colon")
                    self.pos += 1
                    child = self.node(depth + 1)
                    value[key], children[key] = child.value, child
                else:
                    child = self.node(depth + 1)
                    value.append(child.value)
                    children.append(child)
                self.ws()
                if self.pos >= len(self.text):
                    self.fail("Unterminated container")
                delimiter = self.text[self.pos]
                self.pos += 1
                if delimiter == closer:
                    break
                if delimiter != ",":
                    self.fail("Expected comma or closing delimiter")
        else:
            match = _NUMBER.match(self.text, start)
            if match:
                value = Number(match.group())
                self.pos += len(match.group())
            else:
                for literal, item in (("true", True), ("false", False), ("null", None)):
                    if self.text.startswith(literal, start):
                        value = item
                        self.pos += len(literal)
                        break
                else:
                    self.fail("Invalid JSON value")
        return _Node(value, start, self.pos, children)

    def document(self):
        root = self.node()
        self.ws()
        if self.pos != len(self.text):
            self.fail("Unexpected trailing content")
        return root


def _root(text):
    if not isinstance(text, str):
        raise TypeError("Document must be text")
    if _RAW_SURROGATE.search(text):
        raise ValueError("Raw surrogate code points cannot be encoded as UTF-8; use JSON Unicode escapes")
    return _Parser(text).document()


def parse(text):
    """Parse JSON with Number lexemes; reject duplicate keys and nonfinite numbers."""
    return _root(text).value


def _at(root, path):
    if not isinstance(path, list):
        raise ValueError("Path must be a list of object keys or array indices")
    node = root
    for part in path:
        if isinstance(node.children, dict) and isinstance(part, str) and part in node.children:
            node = node.children[part]
        elif isinstance(node.children, list) and type(part) is int and 0 <= part < len(node.children):
            node = node.children[part]
        else:
            raise ValueError(f"Path does not exist: {path!r}")
    return node


def section(text, path):
    node = _at(_root(text), path)
    return text[node.start:node.end]


def replace(text, path, value_text):
    """Replace an existing value only, preserving all surrounding source text."""
    node = _at(_root(text), path)
    replacement = _root(value_text)
    return text[:node.start] + value_text[replacement.start:replacement.end] + text[node.end:]


def _kind(value):
    if isinstance(value, Number):
        return "number"
    return {dict: "object", list: "array", str: "string", bool: "boolean", type(None): "null"}[type(value)]


def _identify(value):
    if not isinstance(value, dict):
        return "unknown", None
    if isinstance(value.get("data"), dict) and isinstance(value["data"].get("world"), dict):
        world, path, name = value["data"]["world"], ["data", "world"], "response"
    elif isinstance(value.get("world"), dict):
        world, path, name = value["world"], ["world"], "world-wrapper"
    else:
        world, path, name = value, [], "world"
    if "initialGameState" in world:
        return name, path + ["initialGameState"]
    if path:
        return name, None
    if any(key in world for key in ("heroesVersion", "triggers", "realms", "aiInstructions", "storySettings")):
        return "game-state", []
    return "unknown", None


def validate(text):
    errors, warnings = [], []
    try:
        root = _root(text)
    except (ValueError, RecursionError) as exc:
        return {"errors": [str(exc)], "warnings": []}
    _, path = _identify(root.value)
    if path is None:
        errors.append("No recognizable GameState found.")
    else:
        state = _at(root, path).value
        if not isinstance(state, dict):
            errors.append("initialGameState must be an object.")
        else:
            for key in ("realms", "regions", "locations", "npcs", "factions", "storyStarts", "traits", "triggers", "aiInstructions", "storySettings"):
                if key in state and not isinstance(state[key], dict):
                    errors.append(f"{key} must be an object.")
            triggers = state.get("triggers", {})
            if isinstance(triggers, dict):
                for key, trigger in triggers.items():
                    prefix = f"triggers[{key!r}]"
                    if not isinstance(trigger, dict):
                        errors.append(f"{prefix} must be an object.")
                        continue
                    for field, expected in (("name", str), ("recurring", bool), ("conditions", list), ("effects", list), ("script", str)):
                        if field in trigger and not isinstance(trigger[field], expected):
                            errors.append(f"{prefix}.{field} must be {expected.__name__}.")
                    for field in ("conditions", "effects"):
                        if isinstance(trigger.get(field), list):
                            for i, item in enumerate(trigger[field]):
                                if not isinstance(item, dict) or not isinstance(item.get("type"), str):
                                    errors.append(f"{prefix}.{field}[{i}] must be an object with a string type.")
                    for field in ("scope", "phase"):
                        if field in trigger and not isinstance(trigger[field], str):
                            errors.append(f"{prefix}.{field} must be a string.")
                    if trigger.get("name", key) != key:
                        warnings.append(f"{prefix}.name differs from its object key.")
            # Only documented record references. See docs/wiki.json schemas for
            # world/npcs, world/regions, world/locations, and world/storyStarts.
            # Dynamic/generated names may be valid at runtime, so these are
            # warnings, not a claim that publication or gameplay will fail.
            references = (("npcs", "currentLocation", "locations", False),
                          ("npcs", "faction", "factions", False),
                          ("regions", "realm", "realms", False),
                          ("locations", "region", "regions", False),
                          ("storyStarts", "locations", "locations", True))
            for source, field, target, multiple in references:
                records, targets = state.get(source, {}), state.get(target, {})
                if not isinstance(records, dict) or not isinstance(targets, dict):
                    continue
                for key, record in records.items():
                    if not isinstance(record, dict):
                        continue
                    refs = record.get(field, []) if multiple else [record.get(field)]
                    if not isinstance(refs, list):
                        continue
                    for reference in refs:
                        if isinstance(reference, str) and reference and reference not in targets:
                            warnings.append(f"{source}[{key!r}].{field}: unresolved reference {reference!r} in {target}; it may be supplied at runtime.")
    warnings.append("Local structural checks only; not authoritative Voyage schema validation. Scripts are not executed or validated.")
    return {"errors": errors, "warnings": warnings}


def inspect(text):
    report = validate(text)
    try:
        root = _root(text)
    except (ValueError, RecursionError):
        return {"format": "invalid", "gameStatePath": None, "sections": [], **report}
    name, path = _identify(root.value)
    value = _at(root, path).value if path is not None else root.value
    sections = []
    if isinstance(value, dict):
        sections = [{"key": key, "type": _kind(item), "count": len(item) if isinstance(item, (dict, list)) else None} for key, item in value.items()]
    return {"format": name, "gameStatePath": path, "sections": sections, **report}


def describe(text, path):
    """Navigation data only: never serialize world numbers as browser numbers."""
    node = _at(_root(text), path)

    def preview(child):
        value = child.value
        if isinstance(value, (dict, list)):
            return f"{len(value)} entries"
        if isinstance(value, str):
            return value[:160] + ("…" if len(value) > 160 else "")
        return text[child.start:child.end]

    entries = node.children.items() if isinstance(node.children, dict) else enumerate(node.children or [])
    return {"type": _kind(node.value), "children": [{"key": key, "type": _kind(child.value), "preview": preview(child)} for key, child in entries]}


def mutate(text, path, action, key=None, value_text=None):
    """Add/remove object members or append/remove array entries.

    Surrounding bytes and surviving value lexemes remain untouched. Removal may
    normalize key spelling and whitespace within the selected container.
    """
    node = _at(_root(text), path)
    if not isinstance(node.children, (dict, list)):
        raise ValueError("Mutation target must be an object or array")
    if action in ("add", "append"):
        replacement = _root(value_text)
        raw = value_text[replacement.start:replacement.end]
        if isinstance(node.children, dict):
            if action != "add" or not isinstance(key, str):
                raise ValueError("Object add requires a string key")
            if key in node.children:
                raise ValueError("Object key already exists")
            raw = json.dumps(key, ensure_ascii=True) + ": " + raw
        elif action != "append":
            raise ValueError("Array insertion uses append")
        insertion = ("," if node.children else "") + raw
        return text[:node.end - 1] + insertion + text[node.end - 1:]
    if action != "remove":
        raise ValueError("Unknown mutation action")
    if isinstance(node.children, dict):
        if not isinstance(key, str) or key not in node.children:
            raise ValueError("Object key does not exist")
        entries = [json.dumps(k, ensure_ascii=True) + ": " + text[v.start:v.end] for k, v in node.children.items() if k != key]
        raw = "{" + ", ".join(entries) + "}"
    else:
        if type(key) is not int or not 0 <= key < len(node.children):
            raise ValueError("Array index does not exist")
        entries = [text[v.start:v.end] for i, v in enumerate(node.children) if i != key]
        raw = "[" + ", ".join(entries) + "]"
    return text[:node.start] + raw + text[node.end:]


def diff(before, after):
    """Structural differences; arrays atomic, number spelling and key order explicit."""
    left, right = _root(before), _root(after)
    changes = []

    def emit(path, kind, a, b):
        changes.append({"path": path, "kind": kind, "before": before[a.start:a.end] if a else None, "after": after[b.start:b.end] if b else None})

    def equal(a, b):
        if type(a) is not type(b):
            return False
        if isinstance(a, dict):
            return list(a) == list(b) and all(equal(a[k], b[k]) for k in a)
        if isinstance(a, list):
            return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
        return a == b

    def walk(a, b, path):
        if isinstance(a.value, dict) and isinstance(b.value, dict):
            ak, bk = list(a.children), list(b.children)
            if [k for k in ak if k in b.children] != [k for k in bk if k in a.children]:
                emit(path, "order", a, b)
            for key in ak:
                if key not in b.children:
                    emit(path + [key], "remove", a.children[key], None)
                else:
                    walk(a.children[key], b.children[key], path + [key])
            for key in bk:
                if key not in a.children:
                    emit(path + [key], "add", None, b.children[key])
        elif not equal(a.value, b.value):
            emit(path, "replace", a, b)

    walk(left, right, [])
    return changes


def replace_draft(text, path, value_text):
    """Retain an invalid section buffer in the full working document, never a proposal."""
    if not isinstance(value_text, str):
        raise ValueError("value must be text")
    node = _at(_root(text), path)
    return text[:node.start] + value_text + text[node.end:]
