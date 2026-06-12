/**
 * DBC parser — Vector CANdb text format → typed AST.
 *
 * Supports the full DBC v3 grammar relevant to passive decoding:
 *
 *   • `VERSION "<text>"` — file version string.
 *   • `NS_ : …` — namespace declarations (recognised, ignored).
 *   • `BS_: …` — bus speed (captured as `bus.baudrate`).
 *   • `BU_: <nodes>` — node list.
 *   • `BO_ <id> <name>: <dlc> <sender>` — message header.
 *   • `  SG_ <name> [M|m<n>] : <start>|<len>@<endian><sign>
 *        (<scale>,<offset>) [<min>|<max>] "<unit>" <receivers>`
 *     — signal definition. Both Intel (LE) and Motorola (BE) byte
 *     orders supported.
 *   • `BO_TX_BU_ <id> : <node>,<node>,… ;` — extra transmitters.
 *   • `EV_ <name>: …;` — environment variables (parsed shape, no
 *     runtime use yet).
 *   • `VAL_TABLE_ <name> <v0> "<t0>" <v1> "<t1>" … ;` — named
 *     enum table that signals can reference.
 *   • `VAL_ <id> <signal> <v0> "<t0>" … ;` OR
 *     `VAL_ <id> <signal> <table-name> ;` — signal enum mapping.
 *   • `CM_ [SG_|BO_|BU_|EV_] [<id> [<name>]] "<text>";` — comments.
 *   • `BA_DEF_ [BO_|SG_|BU_|EV_] "<name>" <type> <args> ;` —
 *     attribute schema. Types: INT, FLOAT, STRING, ENUM, HEX.
 *   • `BA_DEF_DEF_ "<name>" <default> ;` — attribute default.
 *   • `BA_ "<name>" [BO_|SG_|BU_|EV_] [<id> [<name>]] <value> ;`
 *     — attribute value applied to a target.
 *   • `SG_MUL_VAL_ <id> <mux-sig> <selector> <range-pairs>;` —
 *     extended multiplex (parsed; current compiler uses simple
 *     `m<id>` notation).
 *   • `SIG_GROUP_` / `BU_BO_REL_` / `BU_SG_REL_` / `SIG_VALTYPE_`
 *     and other less common constructs — recognised, ignored.
 *
 * The grammar is intentionally line-oriented. Multi-line `CM_`
 * strings are folded by quote balancing before tokenisation.
 */

/** Endianness for `DbcSignal`. */
export type DbcEndian = "intel" | "motorola";

/** Sign for `DbcSignal`. */
export type DbcSign = "unsigned" | "signed";

/** Attribute value type tag — drives `BA_` value parsing. */
export type DbcAttrType =
  | { kind: "int"; min: number; max: number }
  | { kind: "float"; min: number; max: number }
  | { kind: "string" }
  | { kind: "enum"; values: string[] }
  | { kind: "hex"; min: number; max: number };

/** Where an attribute may be applied. */
export type DbcAttrScope = "global" | "BO_" | "SG_" | "BU_" | "EV_";

export interface DbcAttrDef {
  name: string;
  scope: DbcAttrScope;
  type: DbcAttrType;
  /** Default value resolved from `BA_DEF_DEF_`. */
  default?: number | string;
}

/** Multiplex role for a signal. */
export type DbcMultiplex =
  | null
  | "selector"
  | { value: number };

/** A signal extracted from a DBC `SG_` line. */
export interface DbcSignal {
  /** Signal name (DBC identifier — alphanumeric + underscore). */
  name: string;
  /** Start bit position. Interpretation depends on endian:
   *   • Intel: LSB of the field, ascending into higher bytes.
   *   • Motorola: MSB of the field; walks high-to-low within
   *     bytes, then jumps to the next byte's MSB across boundaries. */
  startBit: number;
  /** Length in bits (1..64). */
  length: number;
  /** Byte order. */
  endian: DbcEndian;
  /** `unsigned` (`+`) or `signed` (`-`). Signed = two's complement. */
  sign: DbcSign;
  /** Physical = raw × scale + offset. */
  scale: number;
  offset: number;
  /** Min / max physical bounds (informational). */
  min: number;
  max: number;
  /** Unit string from the DBC ("°C", "%", …). May be empty. */
  unit: string;
  /** ECU names that read this signal (informational). */
  receivers: string[];
  /** Multiplex role. */
  multiplex: DbcMultiplex;
  /** Free-text comment (from `CM_ SG_`), if any. */
  comment?: string;
  /** Enum values (from `VAL_` or `VAL_TABLE_`), keyed by raw integer. */
  values?: Record<number, string>;
  /** Attribute values applied to this signal (e.g. `GenSigStartValue`). */
  attributes?: Record<string, number | string>;
  /** Extended multiplex ranges from `SG_MUL_VAL_`. Used when this
   *  signal participates in multi-level multiplexing. */
  mulVal?: { selector: string; ranges: Array<{ min: number; max: number }> };
}

/** A message extracted from a DBC `BO_` line. */
export interface DbcMessage {
  /** 11-bit or 29-bit CAN ID. */
  id: number;
  /** Whether `id` is an extended (29-bit) identifier. */
  ext: boolean;
  /** Message name. */
  name: string;
  /** Declared payload length (DLC), 0..8 for classical CAN. */
  dlc: number;
  /** Primary sender ECU name. */
  sender: string;
  /** Additional senders from `BO_TX_BU_`. */
  additionalSenders?: string[];
  /** Signals on this message, in source order. */
  signals: DbcSignal[];
  /** Free-text comment (`CM_ BO_`), if any. */
  comment?: string;
  /** Attribute values (e.g. `GenMsgCycleTime` → cycle time in ms). */
  attributes?: Record<string, number | string>;
}

/** An ECU/node entry from `BU_:`. */
export interface DbcNode {
  name: string;
  comment?: string;
  attributes?: Record<string, number | string>;
}

/** An environment variable from `EV_`. */
export interface DbcEnvVar {
  name: string;
  type: number;
  min: number;
  max: number;
  unit: string;
  initial: number;
  evId: number;
  accessType: string;
  accessNodes: string[];
  comment?: string;
  values?: Record<number, string>;
}

/** Bus settings from `BS_:`. */
export interface DbcBus {
  baudrate?: number;
  btr1?: number;
  btr2?: number;
}

/** Top-level DBC parse result. */
export interface DbcDatabase {
  /** Optional VERSION string. */
  version: string;
  /** Bus speed (`BS_:`). Usually empty in real files. */
  bus: DbcBus;
  /** Node names. */
  nodes: DbcNode[];
  /** Messages keyed by CAN ID. */
  messages: Map<number, DbcMessage>;
  /** Named enum value tables (`VAL_TABLE_`) for cross-reference. */
  valueTables: Map<string, Record<number, string>>;
  /** Environment variables. */
  envVars: Map<string, DbcEnvVar>;
  /** Global attribute definitions (`BA_DEF_`). */
  attrDefs: Map<string, DbcAttrDef>;
}

/* ── Regex set ─────────────────────────────────────────────────── */

const RE_VERSION = /^VERSION\s+"(.*)"\s*$/;
const RE_BS      = /^BS_:\s*(?:(\d+)(?::(\d+),(\d+))?)?\s*$/;
const RE_BU      = /^BU_:\s*(.*)$/;
const RE_BO      = /^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+(\S+)\s*$/;
const RE_BO_TX   = /^BO_TX_BU_\s+(\d+)\s*:\s*(.*?)\s*;?\s*$/;
const RE_SG = new RegExp(
  "^\\s*SG_\\s+(\\w+)" +              // 1: name
    "(?:\\s+(M|m\\d+))?" +            // 2: multiplex marker
    "\\s*:\\s*" +
    "(\\d+)\\|(\\d+)" +               // 3: start, 4: length
    "@([01])([+\\-])" +              // 5: endian, 6: sign
    "\\s*\\(([^,]+),([^)]+)\\)" +    // 7: scale, 8: offset
    "\\s*\\[([^|]+)\\|([^\\]]+)\\]" + // 9: min, 10: max
    '\\s*"([^"]*)"' +                // 11: unit
    "\\s*(.*)$",                     // 12: receivers
);

const RE_VAL_TABLE = /^VAL_TABLE_\s+(\w+)\s+(.*?);?\s*$/;
/* `VAL_ <id> <sig> <pairs>;` OR `VAL_ <id> <sig> <table-name>;` */
const RE_VAL_SIG = /^VAL_\s+(\d+)\s+(\w+)\s+(.*?);?\s*$/;
const RE_VAL_PAIR = /(-?\d+)\s+"([^"]*)"/g;

const RE_CM_SG  = /^CM_\s+SG_\s+(\d+)\s+(\w+)\s+"((?:[^"\\]|\\.)*)"\s*;?\s*$/s;
const RE_CM_BO  = /^CM_\s+BO_\s+(\d+)\s+"((?:[^"\\]|\\.)*)"\s*;?\s*$/s;
const RE_CM_BU  = /^CM_\s+BU_\s+(\w+)\s+"((?:[^"\\]|\\.)*)"\s*;?\s*$/s;
const RE_CM_EV  = /^CM_\s+EV_\s+(\w+)\s+"((?:[^"\\]|\\.)*)"\s*;?\s*$/s;
const RE_CM     = /^CM_\s+"((?:[^"\\]|\\.)*)"\s*;?\s*$/s;

const RE_BA_DEF = new RegExp(
  "^BA_DEF_\\s+" +
    "(BO_|SG_|BU_|EV_)?\\s*" +           // 1: scope marker
    '"([^"]+)"\\s+' +                    // 2: attribute name
    "(INT|FLOAT|STRING|ENUM|HEX)" +      // 3: type
    "\\s*(.*?)\\s*;?\\s*$",              // 4: type args
);
const RE_BA_DEF_DEF = /^BA_DEF_DEF_\s+"([^"]+)"\s+(.*?)\s*;?\s*$/;
const RE_BA = new RegExp(
  '^BA_\\s+"([^"]+)"\\s+' +              // 1: attribute name
    "(?:" +
    "(BO_)\\s+(\\d+)|" +                  // 2,3: BO_ scope, id
    "(SG_)\\s+(\\d+)\\s+(\\w+)|" +        // 4,5,6: SG_ scope, id, sig
    "(BU_)\\s+(\\w+)|" +                  // 7,8: BU_ scope, node
    "(EV_)\\s+(\\w+)" +                   // 9,10: EV_ scope, name
    ")?" +
    "\\s*(.*?)\\s*;?\\s*$",
);

const RE_EV = new RegExp(
  "^EV_\\s+(\\w+)\\s*:\\s*" +
    "(\\d+)\\s+" +                         // type
    "\\[([^|]+)\\|([^\\]]+)\\]\\s+" +      // min|max
    '"([^"]*)"\\s+' +                      // unit
    "([\\-\\d.eE+]+)\\s+" +                // initial
    "(\\d+)\\s+" +                         // ev id
    "(\\w+)\\s+" +                         // access type
    "(.*?);?\\s*$",                        // access nodes
);

const RE_SG_MUL_VAL = /^SG_MUL_VAL_\s+(\d+)\s+(\w+)\s+(\w+)\s+(.+?);?\s*$/;

/* ── Public API ────────────────────────────────────────────────── */

/** Parse a DBC string into a `DbcDatabase`. Throws on malformed
 *  required-grammar lines (BO_, SG_, VAL_, CM_, BA_*); unrecognised
 *  constructs are skipped silently. */
export function parseDbc(text: string): DbcDatabase {
  const out: DbcDatabase = {
    version: "",
    bus: {},
    nodes: [],
    messages: new Map(),
    valueTables: new Map(),
    envVars: new Map(),
    attrDefs: new Map(),
  };

  /* Comments + some attributes can span multiple lines (the DBC
     spec lets newlines appear inside the quoted body). Fold them
     into single logical lines via quote-balance counting. */
  const logical = foldContinuations(text);
  let currentMessage: DbcMessage | null = null;

  for (let i = 0; i < logical.length; i++) {
    const line = logical[i]!.line;
    const lineNo = logical[i]!.lineNo;
    if (!line.trim()) continue;

    /* Signals nest under BO_ via leading whitespace. */
    if (currentMessage && /^\s+SG_\s/.test(line)) {
      const sg = parseSignal(line, lineNo);
      currentMessage.signals.push(sg);
      continue;
    }
    /* Any non-SG line at the top level closes the current message. */
    currentMessage = null;

    if (line.startsWith("BO_TX_BU_")) {
      const m = RE_BO_TX.exec(line);
      if (!m) throw new Error(`Bad BO_TX_BU_ line ${lineNo}: ${line}`);
      const id = parseInt(m[1]!, 10) & 0x1FFFFFFF;
      const target = out.messages.get(id);
      if (target) {
        target.additionalSenders = m[2]!.split(",").map((s) => s.trim()).filter(Boolean);
      }
      continue;
    }

    if (line.startsWith("BO_")) {
      const m = RE_BO.exec(line);
      if (!m) throw new Error(`Bad BO_ line ${lineNo}: ${line}`);
      const rawId = parseInt(m[1]!, 10);
      const ext = (rawId & 0x80000000) !== 0;
      const id = rawId & 0x1FFFFFFF;
      const msg: DbcMessage = {
        id, ext,
        name: m[2]!,
        dlc: parseInt(m[3]!, 10),
        sender: m[4]!,
        signals: [],
      };
      out.messages.set(id, msg);
      currentMessage = msg;
      continue;
    }

    if (line.startsWith("VAL_TABLE_")) {
      const m = RE_VAL_TABLE.exec(line);
      if (!m) throw new Error(`Bad VAL_TABLE_ line ${lineNo}: ${line}`);
      out.valueTables.set(m[1]!, parsePairs(m[2]!));
      continue;
    }

    if (line.startsWith("VAL_")) {
      const m = RE_VAL_SIG.exec(line);
      if (!m) throw new Error(`Bad VAL_ line ${lineNo}: ${line}`);
      const msgId = parseInt(m[1]!, 10) & 0x1FFFFFFF;
      const sigName = m[2]!;
      const tail = m[3]!.trim();
      const target = out.messages.get(msgId);
      const sig = target?.signals.find((s) => s.name === sigName);
      if (!sig) continue;
      /* If the tail is a bare identifier it references a VAL_TABLE_;
         otherwise it's an inline list of value/text pairs. */
      if (/^\w+$/.test(tail) && out.valueTables.has(tail)) {
        sig.values = { ...out.valueTables.get(tail)! };
      } else {
        sig.values = parsePairs(tail);
      }
      continue;
    }

    if (line.startsWith("CM_ SG_")) {
      const m = RE_CM_SG.exec(line);
      if (!m) continue; // tolerate malformed comments
      const target = out.messages.get(parseInt(m[1]!, 10) & 0x1FFFFFFF);
      const sig = target?.signals.find((s) => s.name === m[2]);
      if (sig) sig.comment = unescapeDbc(m[3]!);
      continue;
    }
    if (line.startsWith("CM_ BO_")) {
      const m = RE_CM_BO.exec(line);
      if (!m) continue;
      const target = out.messages.get(parseInt(m[1]!, 10) & 0x1FFFFFFF);
      if (target) target.comment = unescapeDbc(m[2]!);
      continue;
    }
    if (line.startsWith("CM_ BU_")) {
      const m = RE_CM_BU.exec(line);
      if (!m) continue;
      const node = out.nodes.find((n) => n.name === m[1]);
      if (node) node.comment = unescapeDbc(m[2]!);
      continue;
    }
    if (line.startsWith("CM_ EV_")) {
      const m = RE_CM_EV.exec(line);
      if (!m) continue;
      const ev = out.envVars.get(m[1]!);
      if (ev) ev.comment = unescapeDbc(m[2]!);
      continue;
    }
    if (line.startsWith("CM_")) {
      const m = RE_CM.exec(line);
      if (m) {
        /* Database-level comment — DBC spec allows it. We ignore. */
      }
      continue;
    }

    if (line.startsWith("BA_DEF_DEF_")) {
      const m = RE_BA_DEF_DEF.exec(line);
      if (!m) continue;
      const def = out.attrDefs.get(m[1]!);
      if (def) {
        const v = parseAttrValue(def, m[2]!.trim());
        if (v !== undefined) def.default = v;
      }
      continue;
    }
    if (line.startsWith("BA_DEF_")) {
      const m = RE_BA_DEF.exec(line);
      if (!m) continue;
      const scopeTok = (m[1] ?? "") as "" | "BO_" | "SG_" | "BU_" | "EV_";
      const scope: DbcAttrScope = scopeTok === "" ? "global" : scopeTok;
      const name = m[2]!;
      const type = parseAttrType(m[3]!, m[4]!.trim());
      out.attrDefs.set(name, { name, scope, type });
      continue;
    }
    if (line.startsWith("BA_")) {
      const m = RE_BA.exec(line);
      if (!m) continue;
      const name = m[1]!;
      const def = out.attrDefs.get(name);
      if (!def) continue;
      const rawValue = m[11]!;
      const value = parseAttrValue(def, rawValue);
      if (value === undefined) continue;
      if (m[2] === "BO_") {
        const target = out.messages.get(parseInt(m[3]!, 10) & 0x1FFFFFFF);
        if (target) (target.attributes ??= {})[name] = value;
      } else if (m[4] === "SG_") {
        const target = out.messages.get(parseInt(m[5]!, 10) & 0x1FFFFFFF);
        const sig = target?.signals.find((s) => s.name === m[6]);
        if (sig) (sig.attributes ??= {})[name] = value;
      } else if (m[7] === "BU_") {
        const node = out.nodes.find((n) => n.name === m[8]);
        if (node) (node.attributes ??= {})[name] = value;
      } else if (m[9] === "EV_") {
        const ev = out.envVars.get(m[10]!);
        if (ev) (ev as { attributes?: Record<string, number | string> }).attributes = {
          ...((ev as { attributes?: Record<string, number | string> }).attributes ?? {}),
          [name]: value,
        };
      }
      continue;
    }

    if (line.startsWith("EV_")) {
      const m = RE_EV.exec(line);
      if (!m) continue;
      out.envVars.set(m[1]!, {
        name: m[1]!,
        type: parseInt(m[2]!, 10),
        min: parseFloat(m[3]!),
        max: parseFloat(m[4]!),
        unit: m[5]!,
        initial: parseFloat(m[6]!),
        evId: parseInt(m[7]!, 10),
        accessType: m[8]!,
        accessNodes: m[9]!.split(",").map((s) => s.trim()).filter(Boolean),
      });
      continue;
    }

    if (line.startsWith("SG_MUL_VAL_")) {
      const m = RE_SG_MUL_VAL.exec(line);
      if (!m) continue;
      const target = out.messages.get(parseInt(m[1]!, 10) & 0x1FFFFFFF);
      const sig = target?.signals.find((s) => s.name === m[2]);
      if (!sig) continue;
      const ranges: Array<{ min: number; max: number }> = [];
      const RE_RANGE = /(-?\d+)-(-?\d+)/g;
      let r: RegExpExecArray | null;
      while ((r = RE_RANGE.exec(m[4]!)) !== null) {
        ranges.push({ min: parseInt(r[1]!, 10), max: parseInt(r[2]!, 10) });
      }
      sig.mulVal = { selector: m[3]!, ranges };
      continue;
    }

    if (line.startsWith("VERSION")) {
      const m = RE_VERSION.exec(line);
      if (m) out.version = m[1]!;
      continue;
    }
    if (line.startsWith("BS_:")) {
      const m = RE_BS.exec(line);
      if (m && m[1]) {
        out.bus.baudrate = parseInt(m[1]!, 10);
        if (m[2] && m[3]) {
          out.bus.btr1 = parseInt(m[2]!, 10);
          out.bus.btr2 = parseInt(m[3]!, 10);
        }
      }
      continue;
    }
    if (line.startsWith("BU_:")) {
      const m = RE_BU.exec(line);
      if (m) {
        out.nodes = m[1]!.trim().split(/\s+/).filter(Boolean).map((name) => ({ name }));
      }
      continue;
    }

    /* Unrecognised top-level construct: NS_ block, SIG_GROUP_,
       BU_SG_REL_, BU_BO_REL_, ENVVAR_DATA_, SIG_VALTYPE_, … —
       silently skipped. */
  }

  return out;
}

/* ── Helpers ───────────────────────────────────────────────────── */

interface FoldedLine { line: string; lineNo: number; }

function foldContinuations(text: string): FoldedLine[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: FoldedLine[] = [];
  let buf: string | null = null;
  let bufLine = 0;
  let openQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!;
    let q = 0;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === "\\") { j++; continue; }
      if (line[j] === '"') q++;
    }
    if (buf === null) {
      buf = line;
      bufLine = i + 1;
      if (q % 2 === 1) openQuote = !openQuote;
      if (!openQuote) { out.push({ line: buf, lineNo: bufLine }); buf = null; }
    } else {
      buf += "\n" + line;
      if (q % 2 === 1) openQuote = !openQuote;
      if (!openQuote) { out.push({ line: buf, lineNo: bufLine }); buf = null; }
    }
  }
  if (buf !== null) out.push({ line: buf, lineNo: bufLine });
  return out;
}

function parseSignal(line: string, lineNo: number): DbcSignal {
  const m = RE_SG.exec(line);
  if (!m) throw new Error(`Bad SG_ line ${lineNo}: ${line}`);
  const muxToken = m[2];
  let multiplex: DbcMultiplex = null;
  if (muxToken === "M") multiplex = "selector";
  else if (muxToken && muxToken.startsWith("m")) {
    multiplex = { value: parseInt(muxToken.slice(1), 10) };
  }
  return {
    name: m[1]!,
    startBit: parseInt(m[3]!, 10),
    length: parseInt(m[4]!, 10),
    endian: m[5] === "1" ? "intel" : "motorola",
    sign: m[6] === "-" ? "signed" : "unsigned",
    scale: parseFloat(m[7]!),
    offset: parseFloat(m[8]!),
    min: parseFloat(m[9]!),
    max: parseFloat(m[10]!),
    unit: m[11]!,
    receivers: m[12]!.trim().split(/\s+/).filter(Boolean),
    multiplex,
  };
}

function parsePairs(tail: string): Record<number, string> {
  const pairs: Record<number, string> = {};
  let p: RegExpExecArray | null;
  RE_VAL_PAIR.lastIndex = 0;
  while ((p = RE_VAL_PAIR.exec(tail)) !== null) {
    pairs[parseInt(p[1]!, 10)] = p[2]!;
  }
  return pairs;
}

function unescapeDbc(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => {
    if (c === "n") return "\n";
    if (c === "t") return "\t";
    return c;
  });
}

function parseAttrType(kind: string, args: string): DbcAttrType {
  switch (kind) {
    case "INT":
    case "HEX": {
      const m = /^(-?\d+)\s+(-?\d+)$/.exec(args.trim());
      const min = m ? parseInt(m[1]!, 10) : 0;
      const max = m ? parseInt(m[2]!, 10) : 0;
      return kind === "HEX" ? { kind: "hex", min, max } : { kind: "int", min, max };
    }
    case "FLOAT": {
      const m = /^([-\d.eE+]+)\s+([-\d.eE+]+)$/.exec(args.trim());
      return {
        kind: "float",
        min: m ? parseFloat(m[1]!) : 0,
        max: m ? parseFloat(m[2]!) : 0,
      };
    }
    case "STRING":
      return { kind: "string" };
    case "ENUM": {
      const values: string[] = [];
      const RE = /"([^"]*)"/g;
      let mm: RegExpExecArray | null;
      while ((mm = RE.exec(args)) !== null) values.push(mm[1]!);
      return { kind: "enum", values };
    }
    default:
      return { kind: "string" };
  }
}

function parseAttrValue(
  def: DbcAttrDef,
  raw: string,
): number | string | undefined {
  raw = raw.trim();
  switch (def.type.kind) {
    case "int":
    case "hex":
      return parseInt(raw, def.type.kind === "hex" ? 16 : 10);
    case "float":
      return parseFloat(raw);
    case "string":
      return raw.replace(/^"|"$/g, "");
    case "enum": {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 0 && n < def.type.values.length) {
        return def.type.values[n]!;
      }
      return raw.replace(/^"|"$/g, "");
    }
    default:
      return undefined;
  }
}
