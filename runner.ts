// This is a mashup of tutorials from:
//
// - https://github.com/AssemblyScript/wabt.js/
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

import wabt from 'wabt';
import * as compiler from './compiler';
import {parse} from './parser';

// NOTE(joe): This is a hack to get the CLI Repl to run. WABT registers a global
// uncaught exn handler, and this is not allowed when running the REPL
// (https://nodejs.org/api/repl.html#repl_global_uncaught_exceptions). No reason
// is given for this in the docs page, and I haven't spent time on the domain
// module to figure out what's going on here. It doesn't seem critical for WABT
// to have this support, so we patch it away.
if(typeof process !== "undefined") {
  const oldProcessOn = process.on;
  process.on = (...args : any) : any => {
    if(args[0] === "uncaughtException") { return; }
    else { return oldProcessOn.apply(process, args); }
  };
}

export async function run(source : string, config: any) : Promise<[any, compiler.Scope]> {
  const wabtInterface = await wabt();
  const parsed = parse(source);
  var returnType = "";
  var returnExpr = "";
  if (parsed.body[parsed.body.length - 1]==undefined) {
    returnType = "(result i32)";
    returnExpr = "(i32.const 0)";
  }
  else {
    if(parsed.body[parsed.body.length - 1].tag === "expr") {
      returnType = "(result i32)";
      returnExpr = "(local.get $$last)"
    }
  }
  const compiled = compiler.compile(source, config.env);
  const importObject = config.importObject;
  if(!importObject.js) {
    const memory = new WebAssembly.Memory({initial:10, maximum:100});
    importObject.js = { memory: memory };
  }
  const wasmSource = `(module
    (func $print (import "imports" "print") (param i32) (result i32))
    (func $abs (import "imports" "abs") (param i32) (result i32))
    (func $max (import "imports" "max") (param i32) (param i32) (result i32))
    (func $min (import "imports" "min") (param i32) (param i32) (result i32))
    (func $pow (import "imports" "pow") (param i32) (param i32) (result i32))
    (import "js" "memory" (memory 1))
    ${compiled.funcCodes}
    (func (export "exported_func") ${returnType}
      ${compiled.myFuncCode}
      ${returnExpr}
    )
  )`;
  console.log("full wat:\n", wasmSource)
  //(func $printglobal (import "imports" "print_global_func") (param i32) (param i32))
  const myModule = wabtInterface.parseWat("test.wat", wasmSource);
  var asBinary = myModule.toBinary({});
  var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);
  const result = (wasmModule.instance.exports.exported_func as any)();
  return [result, compiled.env.super];
}