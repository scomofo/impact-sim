export * from "./matrix.ts";
export * from "./ode.ts";
export * from "./numeric.ts";
export * as astro from "./astro.ts";
export * as impact from "./impact.ts";
export {
  Interpreter,
  RuntimeError,
  formatValue,
  struct,
  type Host,
  type PlotState,
  type PlotSeries,
  type Value,
} from "./matlab/interpreter.ts";
export { builtins } from "./matlab/builtins.ts";
export { parse } from "./matlab/parser.ts";
export { tokenize } from "./matlab/lexer.ts";

import { Interpreter, type Host } from "./matlab/interpreter.ts";
import { builtins } from "./matlab/builtins.ts";

/** Create a ready-to-use MATLAB-syntax interpreter bound to a host. */
export function createConsole(host: Host): Interpreter {
  return new Interpreter(host, builtins);
}
