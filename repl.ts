import {run} from "./runner";
import {parse} from './parser'
import {Scope, compile} from "./compiler"
import {Type, Value, Stmt} from './ast'
import {NUM,BOOL,NONE,CLASS} from './utils'

interface REPL {
  run(source : string) : Promise<any>;
}

export class BasicREPL {
  currentEnv: Scope
  importObject: any
  memory: any
  constructor(importObject : any) {
    this.importObject = importObject;
    if(!importObject.js) {
      const memory = new WebAssembly.Memory({initial:2000, maximum:2000});
      this.importObject.js = { memory: memory };
    }
    this.currentEnv = new Scope(null, "__super__");
  }
  async run(source : string) : Promise<Value> {
    const [result, newEnv] = await run(source, {importObject: this.importObject, env: this.currentEnv});
    this.currentEnv = newEnv;
    return result;
  }
  async tc(source: string): Promise<Type> {
    const ast = parse(source);
    const compiled = compile(ast, this.currentEnv);
    
    var type = 'none'
    const stmt:Stmt = ast.body[ast.body.length - 1]
    if (stmt!=undefined) {
      if(stmt.tag === "expr") {
        type = stmt.expr.type
      }
    }

    switch(type) {
      case "int":
        return NUM
      case "bool":
        return BOOL
      case "none":
        return NONE
      default:
        return CLASS(type)
    }
  }

}