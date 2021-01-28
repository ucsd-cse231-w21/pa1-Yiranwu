import { textChangeRangeIsUnchanged } from "typescript";
import { Expr, Stmt, Literal, FuncDef, VarDef, TypedVar, FuncBody, Def, Program } from "./ast";
import { parse } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

type CompileResult = {
  funcCodes: string
  myFuncCode: string,
  env: Scope
};

type VarEntry = {
  type:string,
  address: number
}

type FuncEntry = {
  type:string,
  argList:string[],
  source: string[]
}

export class Scope {
  vars: Map <string, VarEntry>;
  funcs: Map <string, FuncEntry>;
  name:string;
  memoryCounter: number
  super: Scope;
  constructor(superEnv: Scope, name:string) {
    this.super = superEnv
    this.name = name
    this.vars = new Map<string, VarEntry>()
    this.funcs = new Map<string, FuncEntry> ()
    if (superEnv==null) 
      this.memoryCounter = 0
    else
      this.memoryCounter = superEnv.memoryCounter
  }
  mergeInto(env: Scope) {
    //assert (env.super == null);
    env.memoryCounter = this.memoryCounter
    this.vars.forEach((varentry, name) => {
      env.vars.set(name, varentry)
    })
    this.funcs.forEach((funcentry, name) => {
      env.funcs.set(name, funcentry) 
    })
  }
  getVar(name:string) : VarEntry {
    console.log(`getvar ${name} in env ${this.name}`)
    if(this.vars.has(name)) {
      console.log(`env ${this.name} has var ${name}`)
    }
    const varEntry = this.vars.get(name)
    if (varEntry==undefined) {
      if (this.super == null) {
        throw new Error(`Variable not found: ${name}`)
      }
      else {
        return this.super.getVar(name)
      }
    }
    return varEntry
  }
  getFunc(name:string):FuncEntry {
    const funcEntry = this.funcs.get(name)
    if (funcEntry==undefined) {
      if (this.super == null) {
        throw new Error(`Function not found: ${name}`)
      }
      else {
        return this.super.getFunc(name)
      }
    }
    return funcEntry
  }
  close(){
    this.vars.clear()
    this.funcs.clear()
  }
}

export function compile(source: string, formerEnv: Scope) : CompileResult {
  const program = parse(source);
  const env = new Scope(formerEnv, "__main__");
  let myFuncCode:Array<string> = []
  let varDefCodes:string[] = [`(local $$last i32)`]
  let varInitCodes:string[] = []
  let funcCodes:string[] = []
  console.log("trying to add former defined vars and funcs")
  console.log(`former env name: ${formerEnv.name}`)
  formerEnv.vars.forEach((varEntry, name) => {
    varDefCodes.push(`(local $${name} i32)`)
    varInitCodes.concat([`(i32.const ${varEntry.address*4})`, `i32.load`, `local.get $${name}`])
  })
  formerEnv.funcs.forEach((funcEntry, name) => {
    funcCodes = funcCodes.concat(funcEntry.source)
  })

  program.defs.forEach(def => {
    switch (def.tag) {
      case "var":
        const varDef = def.def
        codeGenVarDef(varDef, env, 'initial')
        break
      case "func":
        const funcDef = def.def
        codeGenFuncDef(funcDef, env, 'initial')
        break
    }
  })

  program.defs.forEach(def => {
    switch (def.tag) {
      case "var":
        const varDef = def.def
        varDefCodes = varDefCodes.concat([`(local $${def.def.name} i32)`])
        const initCode = codeGenVarDef(varDef, env, 'final')
        varInitCodes = varInitCodes.concat(initCode)
        break
      case "func":
        const funcDef = def.def
        funcCodes = funcCodes.concat(codeGenFuncDef(funcDef, env, 'final'))
        break
    }
  })

  myFuncCode = myFuncCode.concat(varDefCodes).concat(varInitCodes)

  const bodyCode = codeGenStmts(program.body, env);
  env.vars.forEach((varEntry, name) => {
    bodyCode.concat([`(local.get $${name})`, `(i32.const ${varEntry.address*4})`, `(i32.store)`])
  })
  myFuncCode = myFuncCode.concat(bodyCode);
  console.log("Generated: ", myFuncCode.join("\n"));
  console.debug('---------')
  console.log("funcCodes: ", funcCodes.join('\n'))

  env.mergeInto(formerEnv)
  env.close()
  return {
    funcCodes: funcCodes.join("\n"),
    myFuncCode: myFuncCode.join("\n"),
    env: env
  };
}

function codeGenVarDef(def: VarDef, env:Scope, mode:string='full') : Array<string> {
  if (mode!='final') {
    const address = env.memoryCounter
    env.memoryCounter = env.memoryCounter + 1
    const varEntry = {type: def.type, address: address}
    env.vars.set(def.name, varEntry)
    if (mode=='initial')
      return null
  }

  let varDefCode:string[] = []
  const initValCode = codeGenLiteral(def.value, env)
  varDefCode = varDefCode.concat(initValCode).concat([`(local.set $${def.name})`])
  console.log(`adding var ${def.name} to env ${env.name}`)
  return varDefCode
}

function codeGenFuncDef(def: FuncDef, env:Scope, mode:string='full') : Array<string> {
  if (mode !='final') {
    const argList:string[] = []
    def.typed_args.forEach(typedArg => {
      argList.push(typedArg.type)
    })
    const funcEntry = {type: def.ret_type, argList:argList, source:['']}
    env.funcs.set(def.name, funcEntry)
    if (mode=='initial')
      return null
  }

  let funcDefCode:string[] = [];
  const funcEnv = new Scope(env, def.name)
  let argString:string = ""
  def.typed_args.forEach(typedArg => {
    argString = argString.concat(`(param $${typedArg.name} i32) `)
  })

  let retString = ""
  if (def.ret_type!='none') {
    retString = `(result i32)`
  }
  funcDefCode = funcDefCode.concat([`(func $${def.name} `.concat(argString).concat(retString)])
  def.typed_args.forEach(typedArg => {
    //funcDefCode.push(`(local.set $${typedArg.name})`)
    const varEntry = {type: typedArg.type, address:0}
    funcEnv.vars.set(typedArg.name, varEntry)
    console.log(`arg ${typedArg.name} added to env ${funcEnv.name}.vars`)
  })
  let varInitCodes:string[] = []
  let varDefCodes:string[] = []
  def.body.defs.forEach(varDef => {
    varDefCodes.push(`(local $${varDef.name} i32)`)
    const varInitCode = codeGenVarDef(varDef, funcEnv)
    varInitCodes = varInitCodes.concat(varInitCode)
  })
  funcDefCode = funcDefCode.concat(varDefCodes).concat(varInitCodes)
  const bodyCode = codeGenStmts(def.body.body, funcEnv)
  funcDefCode = funcDefCode.concat(bodyCode).concat([`(i32.const 0)`, `(return)`]).concat([`)`])
  const funcEntry = env.funcs.get(def.name)
  funcEntry.source = funcDefCode
  funcEnv.close()
  return funcDefCode
}

function codeGenStmts(stmts: Stmt[], env:Scope) : Array<string> {
  let stmtsCode:string[] = []
  stmts.forEach(stmt => {
    const stmtCode = codeGenStmt(stmt, env)
    stmtsCode = stmtsCode.concat(stmtCode)
  })
  return stmtsCode
}

function codeGenStmt(stmt: Stmt, env:Scope) : Array<string> {
  console.log(`codeGenStmt tag=${stmt.tag}`)
  switch(stmt.tag) {
    //stmt := <name> = <expr>
    case "assign":
      const lvalue = env.getVar(stmt.name)
      let valCode = codeGenExpr(stmt.value, env);
      checkIsType(lvalue.type, stmt.value.type, "assign statement")
      return valCode.concat([`(local.set $${stmt.name})`]);
    //    | if <expr>: <stmt>+ [elif <expr>: <stmt>+]? [else: <stmt>+]?
    case "if": {
      let condCode = codeGenExpr(stmt.cond, env)
      checkIsType(stmt.cond.type, "bool", "if condition")
      let ifCode:string[]= condCode.concat([`(if`]).concat([`(then`])
      const thenCode = codeGenStmts(stmt.then_block, env)
      ifCode = ifCode.concat(thenCode).concat([`)`])
      const elifCode = codeGenStmts(stmt.elif_block, env)
      const elseCode = codeGenStmts(stmt.else_block, env)
      //assert ((elifCode.length==0) || (elseCode.length==0))
      const wasmElseBranch = elifCode.concat(elseCode)
      if (wasmElseBranch.length>0) {
        ifCode = ifCode.concat(['(else']).concat(wasmElseBranch).concat([')',')'])
      }
      else {
        ifCode = ifCode.concat([`)`])
      }
      return ifCode
    }
    //    | while <expr>: <stmt>+
    case "while": {
      let whileCode:string[] = ['(block','(loop']
      const condCode = codeGenExpr(stmt.cond, env)
      checkIsType(stmt.cond.type, "bool", "while condition")
      whileCode = whileCode.concat(condCode).concat([`(i32.const 1)`,`(i32.xor)`]).concat([`(br_if 1)`])
      const whileBody = codeGenStmts(stmt.body, env)
      whileCode = whileCode.concat(whileBody).concat(['(br 0)', ')', ')'])
      return whileCode
    }
    //    | pass
    case "pass":
      break
    //    | return <expr>?
    case "return": {
      if (env.super == null) {
        throw new Error("returning outside function")
      }
      const funcEntry = env.getFunc(env.name)
      const valCode = codeGenExpr(stmt.value, env)
      checkIsType(stmt.value.type, funcEntry.type, "function return")
      return valCode.concat([`(return)`])
    }
    //    | <expr>
    case "expr":
      let exprCode = codeGenExpr(stmt.expr, env);
      return exprCode.concat([`(local.set $$last)`]);
  }
}

function codeGenExpr(expr : Expr, env:Scope) : Array<string> {
  console.log(`codeGenExpr tag=${expr.tag}`)
  switch(expr.tag) {
    //expr := <literal>
    case "literal":
      const literalCode = codeGenLiteral(expr.value, env)
      expr.type = expr.value.type
      console.log(`codegenexpr at literal: opd1 type=${expr.type}`)
      return literalCode
    //    | <name>
    case "id":
      console.log(`codeGenExpr for tag id: env:${env.name}`)
      const varEntry = env.getVar(expr.name)
      expr.type = varEntry.type
      console.log(`codegenexpr at id: name=${expr.name}, type=${expr.type}`)
      return [`(local.get $${expr.name})`];
    //    | <uniop> <expr>
    //      uniop := not | -
    case "unaryexpr":
      const opdCode = codeGenExpr(expr.opd, env)
      switch (expr.op) {
        case "not":
          checkIsType(expr.opd.type, "bool", "unary not")
          expr.type = "bool"
          return opdCode.concat([`(i32.const 1)`, `(i32.xor)`])
        case "-":
          checkIsType(expr.opd.type, "int", "unary negation")
          expr.type = "int"
          return [`(i32.const 0)`].concat(opdCode).concat([`(i32.sub)`])
        default:
          throw new Error("unrecognized unary expression")
      }
    //    | <expr> <binop> <expr>
    //      binop := + | - | * | // | % | == | != | <= | >= | < | > | is  
    case "binexpr":
      const opd1Code = codeGenExpr(expr.opd1, env);
      const opd2Code = codeGenExpr(expr.opd2, env);
      switch(expr.op) {
        case "+":
        case "-":
        case "*":
        case "//":
        case "%":
          console.log(`codegenexpr at binexpr: opd1 type=${expr.opd1.type}`)
          checkIsType(expr.opd1.type, "int", "binary arithemetic op")
          checkIsType(expr.opd2.type, "int", "binary arithemetic op")
          expr.type = "int"
          return opd1Code.concat(opd2Code.concat([binOp2Wat(expr.op)]));
        case "==":
        case "!=":
        case "<=":
        case ">=":
        case "<":
        case ">":
          checkIsType(expr.opd1.type, "int", "binary comparison op")
          checkIsType(expr.opd2.type, "int", "binary comparison op")
          expr.type = "bool"
          return opd1Code.concat(opd2Code.concat([binOp2Wat(expr.op)]));
        case "is":
          expr.type= "bool"
          const type1 = expr.opd1.type
          const type2 = expr.opd2.type
          let result:boolean = null
          if (type1 == 'none') {
            result = true
          }
          else {
            result = (type1 == type2)
          }
          console.log(`is return value: ${result}`)
          return codeGenLiteral({tag:"bool", value:result, type:"bool"}, env)
        default:
          throw new Error ("unrecognized binop")
      }
    //    | ( <expr> )
    // resolved by parser

    //    | <name>([<expr> [, <expr>]*]?)
    case "callexpr":
      const func = env.getFunc(expr.name)
      if (func.argList.length != expr.args.length) {
        throw new Error(`calling function ${expr.name} with wrong number of args`)
      }
      let argsCode:string[] = []
      for (let i in expr.args) {
        const argCode = codeGenExpr(expr.args[i], env)
        checkIsType(func.argList[i], expr.args[i].type, "function arg")
        argsCode = argsCode.concat(argCode)
      }
      expr.type = func.type
      return argsCode.concat([`(call $${expr.name})`])
  }
}

function codeGenLiteral(literal:Literal, env:Scope) : Array<string> {
  switch(literal.tag) {
    case "int":
      literal.type = "int"
      return [`(i32.const ${literal.value})`]
    case "bool":
      literal.type = "bool"
      if (literal.value)
        return [`(i32.const 1)`]
      else
        return [`(i32.const 0)`]
    case "none":
      literal.type = "none"
      return [`(i32.const 0)`]
  }
}

function binOp2Wat(op:string) :string {
  switch (op) {
    case "+":
      return `(i32.add)`
    case "-":
      return `(i32.sub)`
    case "*":
      return `(i32.mul)`
    case "//":
      return `(i32.div_s)`
    case "%":
      return `(i32.rem_s)`
    case "==":
      return `(i32.eq)`
    case "!=":
      return `(i32.ne)`
    case "<=":
      return `(i32.le_s)`
    case ">=":
      return `(i32.ge_s)`
    case "<":
      return `(i32.lt_s)`
    case ">":
      return `(i32.gt_s)`
  }
}

function checkIsType(type:string, correct_type:string, errType: string) {
  if (type!=correct_type) {
    throw new Error(`Type Mismatch for ${errType}`)
  }
}
