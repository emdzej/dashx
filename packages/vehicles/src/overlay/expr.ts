/**
 * Sandboxed expression evaluator for overlay `derived` signals.
 *
 * Wraps `expr-eval` with a fixed function set + an inputs map. The
 * expression source can reference:
 *
 *   • Other signal ids — `ENGINE_RPM`, `VEHICLE_SPEED_RAW`, etc.
 *     Resolved from the inputs map at evaluation time.
 *   • Math builtins — `abs(x)`, `min(a,b,…)`, `max(a,b,…)`,
 *     `floor(x)`, `ceil(x)`, `round(x)`, `sqrt(x)`, `pow(a,b)`.
 *   • Range helpers — `clamp(x, lo, hi)`, `inRange(x, lo, hi)`.
 *   • Boolean coercion — `bool(x)` (truthy = `true`).
 *   • Literals — decimal numbers, hex (`0x160`), `true`, `false`,
 *     `null`.
 *   • Operators — `+ - * / %`, `< > <= >= == != && || !`,
 *     `? :` (ternary), `(…)` grouping.
 *
 * Forbidden:
 *
 *   • Function definitions, lambdas, or arrow functions.
 *   • Member access (`obj.prop`, `obj["prop"]`), `this`, `new`.
 *   • Assignment, comma operator, increment/decrement.
 *   • Anything that could touch the surrounding JS context.
 *
 * `expr-eval` covers exactly this subset by design — its parser
 * rejects member access, `eval`-style strings, and statement-level
 * syntax. The only risk is a runaway expression (huge `pow(2, n)`);
 * we cap input lengths but don't time-limit (these run on the UI
 * thread; a malicious overlay can only DoS itself).
 *
 * Null semantics: when a referenced signal hasn't been decoded yet,
 * the evaluator returns `null` for the whole expression rather than
 * substituting 0. That keeps "no data yet" distinguishable from "0
 * km/h" at the widget level.
 */

import { Parser, type Expression } from "expr-eval";

/** A compiled expression — call `.evaluate(scope)` to run it. */
export interface CompiledExpression {
  readonly source: string;
  readonly references: ReadonlySet<string>;
  evaluate(scope: ExprScope): number | boolean | null;
}

/** Input map: signal id → current value (or `null`/`undefined`
 *  when not yet decoded). */
export type ExprScope = Record<string, number | boolean | null | undefined>;

/** Maximum expression source length. Keeps a malicious overlay
 *  from shipping a 10 MB string and locking up the UI thread. */
const MAX_EXPR_LEN = 4_096;

/** Build the singleton parser with our custom function set. */
function buildParser(): Parser {
  const parser = new Parser({
    operators: {
      add: true, comparison: true, concatenate: false,
      conditional: true, divide: true, factorial: false,
      logical: true, multiply: true, power: true, remainder: true,
      subtract: true,
      // disable string operations / assignment
      assignment: false,
      in: false,
    },
  });
  parser.functions.bool = (x: unknown) => !!x;
  parser.functions.clamp = (x: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, x));
  parser.functions.inRange = (x: number, lo: number, hi: number) =>
    x >= lo && x <= hi;
  return parser;
}

const PARSER = buildParser();

/** Collect every identifier the expression references. Used by the
 *  reactive layer to subscribe only to relevant inputs. */
function collectVariables(expr: Expression): Set<string> {
  /* `Expression.variables()` returns top-level names including
     functions — we strip known function names + math constants. */
  const builtins = new Set([
    "abs", "min", "max", "floor", "ceil", "round", "sqrt", "pow",
    "exp", "log", "sin", "cos", "tan", "atan", "atan2", "sign",
    "trunc", "bool", "clamp", "inRange",
    "PI", "E",
    "true", "false", "null",
  ]);
  const out = new Set<string>();
  for (const v of expr.variables()) {
    if (!builtins.has(v)) out.add(v);
  }
  return out;
}

/** Compile an expression source into a `CompiledExpression`. Throws
 *  on parse error with the original source quoted in the message. */
export function compileExpression(source: string): CompiledExpression {
  if (source.length > MAX_EXPR_LEN) {
    throw new Error(`Expression too long (${source.length} > ${MAX_EXPR_LEN}): ${source.slice(0, 80)}…`);
  }
  let expr: Expression;
  try {
    expr = PARSER.parse(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid expression "${source}": ${msg}`);
  }
  const references = collectVariables(expr);
  return {
    source,
    references,
    evaluate(scope: ExprScope) {
      /* Null-propagation: if any referenced signal is null/undefined,
         the whole expression short-circuits to null. That's the
         "no data yet" sentinel the widgets understand. */
      for (const ref of references) {
        const v = scope[ref];
        if (v === null || v === undefined) return null;
      }
      try {
        /* expr-eval's `evaluate` types its `values` arg as a
           recursive `Value` union that excludes booleans, but the
           runtime happily coerces `true`→1 / `false`→0 when used in
           arithmetic. We pass through an `unknown` cast to avoid
           noisy per-property coercion in the caller. */
        const result = expr.evaluate(
          scope as unknown as Record<string, number>,
        );
        if (typeof result === "boolean") return result;
        if (typeof result === "number") {
          if (!Number.isFinite(result)) return null;
          return result;
        }
        return null;
      } catch {
        /* Runtime expression errors (division by zero, etc.) return
           null rather than poisoning the overlay. */
        return null;
      }
    },
  };
}
