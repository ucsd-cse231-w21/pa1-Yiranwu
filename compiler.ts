import { ENGINE_METHOD_NONE } from "constants";
import { type } from "os";
import { isConstructorDeclaration, isLiteralExpression, textChangeRangeIsUnchanged } from "typescript";
import { Expr, Stmt, Literal, FuncDef, VarDef, ClassDef, TypedVar, FuncBody, Def, Program } from "./ast";
import { parse, isBasicType } from "./parser";

// https://learnxinyminutes.com/docs/wasm/

type CompileResult = {
  funcCodes: string,
  myFuncCode: string,
  env: Scope
};

type VarEntry = {
  name: string,
  type: string,
  address: number,
  isParam: boolean,
  addressSource: string[],
  initValueSource: string[]
}

type FuncEntry = {
  name:string,
  type:string,
  argList:VarEntry[],
  body: Stmt[],
  vars:Map<string, VarEntry>,
  env:Scope
  source: string[]
}

type ClassEntry  = {
  members: Map <string, VarEntry>;
  methods: FuncEntry[];
  initFunc: FuncEntry
}

export class Scope {
  vars: Map <string, VarEntry>;
  funcs: Map <string, FuncEntry>;
  classes: Map <string, ClassEntry>;
  classIndexToName: Map <number, string>;
  classNameToIndex: Map <string, number>
  name:string;
  memoryCounter: number;
  super: Scope;
  constructor(superEnv: Scope, name:string) {
    this.super = superEnv
    this.name = name
    this.vars = new Map<string, VarEntry>()
    this.funcs = new Map<string, FuncEntry> ()
    this.classes = new Map <string, ClassEntry>()
    this.classIndexToName = new Map <number, string>()
    this.classNameToIndex = new Map <string, number>()
    this.memoryCounter = 0
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
  getClass(name:string):ClassEntry {
    const classEntry = this.classes.get(name)
    if (classEntry==undefined) {
      if (this.super == null) {
        throw new Error(`Class not found: ${name}`)
      }
      else {
        return this.super.getClass(name)
      }
    }
    return classEntry
  }
  getClassMember(classname:string, name:string) : VarEntry {
    const classEntry = this.getClass(classname)
    if (!classEntry.members.has(name))
      throw new Error(`Class ${classname} has no member ${name}`)
    return classEntry.members.get(name)
  }
  getClassMethod(classname:string, name:string): FuncEntry {
    //const classEntry = this.getClass(classname)
    //if (!classEntry.methods.has(name))
    //  throw new Error(`Class ${classname} has no method ${name}`)
    //return classEntry.methods.get(name)
    return this.getFunc(`${classname}${name}`)
  }
  addClass(name:string, classEntry:ClassEntry){
    this.classes.set(name, classEntry)
    const classNumber = this.classIndexToName.size
    this.classIndexToName.set(classNumber, name)
    this.classNameToIndex.set(name, classNumber)
  }
  close(){
    this.vars.clear()
    this.funcs.clear()
    this.classes.clear()
    this.classIndexToName.clear()
    this.classNameToIndex.clear()
  }
}

export function compile(program:Program, formerEnv: Scope) : CompileResult {
  const env = formerEnv;
  let myFuncCode:Array<string> = []
  let varDefCodes:string[] = [`(local $$last i32)`, `(local $CURRENTOFFSET i32)`]
  let varInitCodes:string[] = []
  let funcCodes:string[] = []
  varInitCodes = varInitCodes.concat([`(i32.const 0)`, `(i32.load)`, `(local.set $CURRENTOFFSET)`])
  env.vars.forEach((varEntry, name) => {
    varDefCodes.push(`(local $${name} i32)`)
    varEntry.addressSource = []
    varInitCodes=varInitCodes.concat([`(local.get $CURRENTOFFSET)`,`(i32.const ${varEntry.address*4})`,`(i32.load)`, `(local.set $${name})`])
  })
  env.funcs.forEach((funcEntry, name) => {
    funcCodes = funcCodes.concat(funcEntry.source)
  })

  let varEntrys:VarEntry[] = []
  let funcEntrys:FuncEntry[] = []
  let classEntrys:ClassEntry[] = []
  program.defs.forEach(def => {
    switch (def.tag) {
      case "var":
        const varDef = def.def
        const varEntry = codeGenVarDefInitialPass(varDef, env)
        varEntrys.push(varEntry)
        break
      case "func":
        const funcDef = def.def
        const funcEntry = codeGenFuncDefInitialPass(funcDef, env)
        funcEntrys.push(funcEntry)
        break
      case "class":
        const classDef = def.def
        const classEntry = codeGenClassDefInitialPass(classDef, env)
        classEntrys.push(classEntry)
        break
    }
  })
  const modifyOffsetCode:string[] = [`(i32.const 0)`, `(i32.const 0)`, `(i32.load)`, `(i32.const ${env.vars.size*4})`,
                                     `(i32.add)`, `(i32.store)`]
  varEntrys.forEach(varEntry => {
    varDefCodes = varDefCodes.concat([`(local $${varEntry.name} i32)`])
    const initCode = codeGenVarDefFinalPass(varEntry, env)
    varInitCodes = varInitCodes.concat(initCode)
  })
  funcEntrys.forEach(funcEntry => {
    funcCodes = funcCodes.concat(codeGenFuncDefFinalPass(funcEntry, env))
  })
  classEntrys.forEach(classEntry => {
    funcCodes = funcCodes.concat(codeGenClassDefFinalPass(classEntry, env))
  })
  const setGlobaOffsetCode:string[] = [`(i32.const 0)`,`(i32.load)`,`(if`,`(then`, `(nop)`,`)`,`(else`,`(i32.const 0)`,
                                       `(i32.const 4)`,`(i32.store)`,`)`,`)`]

  myFuncCode = myFuncCode.concat(varDefCodes).concat(setGlobaOffsetCode).concat(varInitCodes).concat(modifyOffsetCode)

  let bodyCode = codeGenStmts(program.body, env);
  //!!!!!!!!!
  env.vars.forEach((varEntry, name) => {
    bodyCode = bodyCode.concat([`(i32.const 0)`,`(i32.load)`,`(i32.const ${varEntry.address*4})`, `(i32.add)`,
                                `(local.get $${name})`, `(i32.store)`])
  })
  myFuncCode = myFuncCode.concat(bodyCode);

  env.close()
  return {
    funcCodes: funcCodes.join("\n"),
    myFuncCode: myFuncCode.join("\n"),
    env: env
  };
}

function codeGenVarDefInitialPass(def: VarDef, env:Scope) : VarEntry {
  const address = env.memoryCounter
  env.memoryCounter += 1
  let varEntry:VarEntry = {name: def.name, type: def.type, address: address, isParam: false,
                           addressSource:[`(local.get $CURRENTOFFSET)`,`(i32.const ${address*4})`,`(i32.add)`],
                           initValueSource: null}
  if (def.value!=null) {
    varEntry.initValueSource=codeGenLiteral(def.value, env)
  }
  else {
    varEntry.isParam=true
  }
  env.vars.set(def.name, varEntry)
  return varEntry
}

function codeGenVarDefFinalPass(varEntry: VarEntry, env:Scope) : Array<string> {
  let varDefCode:string[] = varEntry.addressSource.concat(varEntry.initValueSource).concat([`(i32.store)`])
  varDefCode = varDefCode.concat(varEntry.addressSource.concat([`(local.set $${varEntry.name})`]))
  return varDefCode
}

function codeGenMemberDefInitialPass(def: VarDef, members: Map<string, VarEntry>) : VarEntry {
  const address = members.size
  //@ts-ignore
  const varEntry = {name: def.name, type: def.type, address: address, isParam:false,
                    addressSource:[`(local.get $CURRENTOFFSET)`,`(i32.const ${address*4})`,`(i32.add)`],
                    initValueSource:codeGenLiteral(def.value, null)}
  members.set(def.name, varEntry)
  return varEntry
}

//function codeGenMemberDefFinalPass(def: VarDef, members:Map<string, VarEntry>) : Array<string> {
//  const initValCode = codeGenLiteral(def.value, null)
//  const varDefCode = initValCode.concat([`(i32.load 0)`,`(i32.const ${members.get(def.name).address})`,`(i32.add)`, `(i32.store)`])
//  return varDefCode.concat([`(i32.load 0)`,`(i32.const ${members.get(def.name).address})`,`(i32.add)`, `(i32.const 0)`,`(i32.store)`])
//}

function codeGenFuncDefInitialPass(def:FuncDef, env:Scope): FuncEntry {
  const argList:VarEntry[] = []
  const funcEnv = new Scope(env, def.name)
  def.typed_args.forEach(typedArg => {
    //@ts-ignore
    const varDef = {name: typedArg.name, type:typedArg.type, value:null}
    const argVarDef = codeGenVarDefInitialPass(varDef, funcEnv)
    argVarDef.initValueSource = [`(local.get $${varDef.name})`]
    argList.push(argVarDef)
  })
  def.body.defs.forEach(varDef => {
    codeGenVarDefInitialPass(varDef, funcEnv)
  })
  const funcEntry = {name:def.name, type: def.ret_type, argList:argList, body:def.body.body, 
                     vars:funcEnv.vars, env:funcEnv, source:['']}
  env.funcs.set(def.name, funcEntry)
  return funcEntry
}

function codeGenFuncDefFinalPass(funcEntry:FuncEntry, env:Scope): Array<string> {
  let funcDefCode:string[] = [];
  let argString:string = ""
  const funcEnv = funcEntry.env
  funcEntry.argList.forEach(argEntry => {
    argString = argString.concat(`(param $${argEntry.name} i32)`)
  })

  let retString = ""
  if (funcEntry.type!='none') {
    retString = `(result i32)`
  }
  funcDefCode = funcDefCode.concat([`(func $${funcEntry.name} `.concat(argString).concat(retString)])
  funcDefCode = funcDefCode.concat([`(local $$last i32)`, ])
  let varInitCodes:string[] = [`(i32.const 0)`, `(i32.load)`, `(local.set $CURRENTOFFSET)`]
  let varDefCodes:string[] = [`(local $CURRENTOFFSET i32)`]
  //funcEntry.argList.forEach(argEntry => {
  //  varInitCodes.push(`(local.set $${argEntry.name})`)
  //})
  const modifyOffsetCode:string[] = [`(i32.const 0)`, `(i32.const 0)`, `(i32.load)`, `(i32.const ${funcEnv.vars.size*4})`,
                                     `(i32.add)`, `(i32.store)`]
  funcEntry.vars.forEach((varEntry, name) => {
    if (!varEntry.isParam)
      varDefCodes.push(`(local $${varEntry.name} i32)`)
    const varInitCode = codeGenVarDefFinalPass(varEntry, funcEnv)
    varInitCodes = varInitCodes.concat(varInitCode)
  })
  funcDefCode = funcDefCode.concat(varDefCodes).concat(varInitCodes).concat(modifyOffsetCode)
  const bodyCode = codeGenStmts(funcEntry.body, funcEnv)
  funcDefCode = funcDefCode.concat(bodyCode).concat([`(return)`]).concat([`)`])
  funcEntry.source = funcDefCode
  funcEnv.close()
  return funcDefCode
}

function codeGenMemberFuncDefInitialPass(classdef: ClassDef, def: FuncDef, env:Scope) : FuncEntry {
  if (def.typed_args.length<1 || def.typed_args[0].name!='self' || def.typed_args[0].type!=classdef.name)
    throw new Error("Invalid argument list for member function definition")
  def.name = `${classdef.name}${def.name}`
  return codeGenFuncDefInitialPass(def, env)
}

function codeGenInitFuncDefInitialPass(def:FuncDef, env:Scope): FuncEntry {
  const argList:VarEntry[] = []
  const funcEnv = new Scope(env, def.name)
  def.body.defs.forEach(varDef => {
    codeGenVarDefInitialPass(varDef, funcEnv)
  })
  const funcEntry = {name:def.name, type: def.ret_type, argList:argList, body:def.body.body, 
                     vars:funcEnv.vars, env:funcEnv, source:['']}
  env.funcs.set(def.name, funcEntry)
  return funcEntry
}

function codeGenInitFuncDefFinalPass(funcEntry: FuncEntry, env:Scope) : Array<string> {
  let funcDefCode:string[] = [];
  const funcEnv = funcEntry.env
  const argString = `(param $self i32)`
  const retString = `(result i32)`
  
  funcDefCode = funcDefCode.concat([`(func $${funcEntry.name} `.concat(argString).concat(retString)])
  funcDefCode = funcDefCode.concat([`(local $CURRENTOFFSET i32)`, `(local.get $self)`, `(local.set $CURRENTOFFSET)`])
  let varCodes:string[] = []
  const modifyOffsetCode:string[] = [`(i32.const 0)`, `(i32.const 0)`, `(i32.load)`, `(i32.const ${funcEnv.vars.size*4})`,
                                     `(i32.add)`, `(i32.store)`]
  funcEntry.vars.forEach((varEntry, name) => {
    if (name!='self') {
      let varCode = varEntry.addressSource
      varCode = varCode.concat(varEntry.initValueSource).concat(`(i32.store)`)
      varCodes = varCodes.concat(varCode)
    }
  })
  funcDefCode = funcDefCode.concat(varCodes).concat(modifyOffsetCode)
  funcDefCode = funcDefCode.concat([`(local.get $self)`, `(return)`]).concat([`)`])
  funcEntry.source = funcDefCode
  funcEnv.close()
  return funcDefCode
}

function codeGenClassDefInitialPass(classdef:ClassDef, env:Scope) : ClassEntry {
  const defs = classdef.defs
  const memberMap = new Map<string, VarEntry> ()
  let methods:FuncEntry[] = []
  //@ts-ignore
  let classEntry = {members: memberMap, methods:methods, initFunc:null}
  env.classes.set(classdef.name, classEntry)
  let initFunc:FuncDef = {name:classdef.name, typed_args:[{name:'self', type:classdef.name}], 
                          ret_type:'none', body:{defs:[], body:[]}}
  defs.forEach(def => {
    if (def.tag=='var') {
      codeGenMemberDefInitialPass(def.def, classEntry.members)
      initFunc.body.defs.push(def.def)
    }
    else if (def.tag=='func') {
      const funcEntry = codeGenMemberFuncDefInitialPass(classdef, def.def, env)
      methods.push(funcEntry)
    }
  })
  const initFuncEntry = codeGenInitFuncDefInitialPass(initFunc, env)
  classEntry.initFunc = initFuncEntry
  return classEntry
}

function codeGenClassDefFinalPass(classEntry: ClassEntry, env:Scope) : Array<string> {
  let classDefCode:string[] = []
  classEntry.methods.forEach(funcEntry => {
      classDefCode = classDefCode.concat(codeGenFuncDefFinalPass(funcEntry, env))
  })
  classDefCode = classDefCode.concat(codeGenInitFuncDefFinalPass(classEntry.initFunc, env))
  return classDefCode
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
  switch(stmt.tag) {
    //stmt := <name> = <expr>
    case "assign":
      let lvalue = env.getVar(stmt.name)
      let valCode = codeGenExpr(stmt.value, env)
      checkIsType(stmt.value.type, lvalue.type, "assign statement")
      return [`(local.get $${stmt.name})`].concat(valCode).concat(`(i32.store)`);
    //{ tag: "fieldassign", object: Expr, name: string, value: Expr}
    case "fieldassign":
      let fieldAssignCode = codeGenExpr(stmt.object, env)
      const fieldOffset = env.getClassMember(stmt.object.type, stmt.name).address
      fieldAssignCode = fieldAssignCode.concat([`(i32.const ${fieldOffset*4})`,`(i32.add)`])
      fieldAssignCode = fieldAssignCode.concat(codeGenExpr(stmt.value, env)).concat([`(i32.store)`])
      return fieldAssignCode
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
    default:
      //@ts-ignore
      console.log(`unrecognized stmt, tag: ${stmt.tag}`)
      throw new Error(`unrecongnized stmt`)
  }
}

function codeGenExpr(expr : Expr, env:Scope) : Array<string> {
  switch(expr.tag) {
    //expr := <literal>
    case "literal":
      const literalCode = codeGenLiteral(expr.value, env)
      expr.type = expr.value.type
      return literalCode
    //    | <name>
    case "id":
      const varEntry = env.getVar(expr.name)
      expr.type = varEntry.type
      return [`(local.get $${expr.name})`, `(i32.load)`];
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
          //maybe problematic
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
          return codeGenLiteral({tag:"bool", value:result, type:"bool"}, env)
        default:
          throw new Error ("unrecognized binop")
      }
    //    | ( <expr> )
    // resolved by parser

    //    | <name>([<expr> [, <expr>]*]?)
    case "callexpr":
      if (expr.name=='print') {
        if(expr.args.length>1)
          throw new Error(`calling print with multiple args, expected 1`)
        if (expr.args[0].type=='none')
          return []
        const argCode = codeGenExpr(expr.args[0], env)
        if (expr.args[0].type=='int')
          return argCode.concat([`(i32.const 0)`,`(call $print)`])
        if (expr.args[0].type=='bool')
          return argCode.concat([`(i32.const 2)`,`(call $print)`])
        const classNameIndex = env.classNameToIndex.get(expr.args[0].type)
        return argCode.concat([`(i32.const ${(classNameIndex<<1)+1})`, `(call $print)`])
      }
      else
        throw new Error("Function not supported")
    //| { tag: "classinit", name:string, type:string}
    case "classinit":
      const classEntry = env.getClass(expr.name)
      let classInitCode = [`(i32.const 0)`, `(i32.load)`, `(call $${expr.name})`]
      expr.type=expr.name
      return classInitCode
    //| { tag: "fieldquery", object: Expr, name: string, type:string}
    case "fieldquery":
      let fieldCode = codeGenExpr(expr.object, env)
      const fieldEntry = env.getClassMember(expr.object.type, expr.name)
      fieldCode=fieldCode.concat([`(i32.const ${fieldEntry.address*4})`, `(i32.add)`, `(i32.load)`])
      expr.type = fieldEntry.type
      return fieldCode
    //| { tag: "methodcall", object: Expr, name:string, args:Expr[], type:string}
    case "methodcall":
      let methodCode = codeGenExpr(expr.object, env)
      const method = env.getClassMethod(expr.object.type, expr.name)

      if (method.argList.length - 1 != expr.args.length) {
        throw new Error(`calling class method ${expr.object.type}.${expr.name} with wrong number of args`)
      }
      for (let i=0; i<expr.args.length; i++) {
        const argCode = codeGenExpr(expr.args[i], env)
        checkIsType(expr.args[i].type,method.argList[i+1].type, "function arg")
        methodCode = methodCode.concat(argCode)
      }
      expr.type = method.type
      return methodCode.concat([`(call $${expr.object.type.concat(expr.name)})`])
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

function checkIsType(sourceType:string, targetType:string, errType: string) {
  if (sourceType!=targetType) {
    if (sourceType=='none' && targetType!='int' && targetType!='bool')
      return
    else throw new Error(`Type Mismatch for ${errType}`)
  }
}
