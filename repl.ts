import {run} from "./runner";
import {Scope} from "./compiler"

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
  async run(source : string) : Promise<any> {
    const [result, newEnv] = await run(source, {importObject: this.importObject, env: this.currentEnv});
    this.currentEnv = newEnv;
    return result;
  }
}