// This is a mashup of tutorials from:
//
// - https://github.com/AssemblyScript/wabt.js/
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

import wabt from 'wabt';
import * as compiler from './compiler';
import {parse} from './parser';
import {Type, Value, Stmt} from './ast'
import {NUM,BOOL, CLASS,NONE ,PyValue} from './utils'

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

export async function run(source : string, config: any) : Promise<[Value, compiler.Scope]> {
  const wabtInterface = await wabt();
  const parsed = parse(source);
  const compiled = compiler.compile(parsed, config.env);
  var returnType = "";
  var returnExpr = "";
  var type = 'none'
  if (parsed.body[parsed.body.length - 1]==undefined) {
    returnType = "(result i32)";
    returnExpr = "(i32.const 0)";
  }
  else {
    if(parsed.body[parsed.body.length - 1].tag === "expr") {
      returnType = "(result i32)";
      returnExpr = "(local.get $$last)"
      const stmt:Stmt = parsed.body[parsed.body.length - 1]
      if (stmt.tag=='expr') {
        console.log(`expr tag: ${stmt.expr.tag}, type:${stmt.expr.type}` )
        if (stmt.expr.tag=='id') {
          console.log (`idexpr, name=${stmt.expr.name}`)
        }
        type = stmt.expr.type
      }
    }
  }
  const importObject = config.importObject;
  if(!importObject.js) {
    const memory = new WebAssembly.Memory({initial:2000, maximum:2000});
    importObject.js = { memory: memory };
  }
  const wasmSource = `(module
    (func $print (import "imports" "print") (param i32) (param i32) (result i32) )
    (import "js" "memory" (memory 1))
    ${compiled.funcCodes}
    (func (export "exported_func") ${returnType}
      ${compiled.myFuncCode}
      ${returnExpr}
    )
  )`;
  console.log("main:\n", compiled.myFuncCode)
  console.log("full wat:\n", wasmSource)
  const myModule = wabtInterface.parseWat("test.wat", wasmSource);
  var asBinary = myModule.toBinary({});
  var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);

  let result = (wasmModule.instance.exports.exported_func as any)();
  console.log(`type=${type}`)
  console.log(`result=${result}`)
  switch(type) {
    case "int":
      return [PyValue(NUM,result,compiled.myFuncCode), compiled.env]
    case "bool":
      return [PyValue(BOOL,result,compiled.myFuncCode), compiled.env]
    case "none":
      return [PyValue(NONE,result,compiled.myFuncCode), compiled.env]
    default:
      return [PyValue(CLASS(type),result, compiled.myFuncCode), compiled.env]
  }
  /*
  switch(type) {
    case "int":
      return [PyValue(NUM,result), compiled.env]
    case "bool":
      return [PyValue(BOOL,result), compiled.env]
    case "none":
      return [PyValue(NONE,result), compiled.env]
    default:
      return [PyValue(CLASS(type),result), compiled.env]
  }
  */
}