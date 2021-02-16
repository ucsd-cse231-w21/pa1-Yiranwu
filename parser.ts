import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import { createFalse, createNamedExports, isConstructorDeclaration } from "typescript";
import {Expr, Stmt, Literal, FuncDef, VarDef, TypedVar, FuncBody, Def, Program, ClassDef} from "./ast";

export function traverseLiteral(c : TreeCursor, s : string) : Literal {
  switch (c.type.name) {
    case "Number":
      return {tag:"int", value: Number(s.substring(c.from, c.to)), type:"int"}
    case "Boolean":
      let boolVal:boolean = null
      switch (s.substring(c.from, c.to)) {
        case "True":
          boolVal = true
          break
        case "False":
          boolVal = false
          break
        default:
          throw new Error("invalid value for bool var")
      }
      return {tag:"bool" ,value:boolVal, type:"int"}
    case "None":
      return {tag:"none", type:"int"}
    default:
      throw new Error ("Invalid literal")
  }
}

export function traverseExpr(c : TreeCursor, s : string) : Expr {
  console.log(`traverseExpr: |${s.substring(c.from, c.to)}|, node name= ${c.type.name}, c_range: ${c.from}, ${c.to}`)
  switch(c.type.name) {
    //expr := <literal>
    case "Number":
    case "Boolean":
    case "None":
      return {
        tag: "literal",
        value: traverseLiteral(c, s),
        type: null
      }
    //      | <name>
    case "VariableName":
    case "self":
      return {
        tag: "id",
        name: s.substring(c.from, c.to),
        type: null
      }
    //      | <uniop> <expr>
    case "UnaryExpression":
      c.firstChild(); // op
      const op = s.substring(c.from, c.to);
      c.nextSibling(); // opd
      const opd = traverseExpr(c, s);
      c.parent();
      return {
        tag: "unaryexpr",
        opd: opd,
        op: op,
        type:null
      }
    //      | <expr> <binop> <expr>
    case "BinaryExpression":
      c.firstChild();
      const opd1 = traverseExpr(c, s);
      c.nextSibling();
      const bop = s.substring(c.from, c.to);
      c.nextSibling();
      const opd2 = traverseExpr(c, s);
      c.parent();
      return {
        tag: "binexpr",
        opd1: opd1,
        op: bop,
        opd2: opd2,
        type:null
      }
    //      | ( <expr> )
    case "ParenthesizedExpression":
      c.firstChild();
      c.nextSibling();
      const expr = traverseExpr(c, s);
      c.parent()
      return expr;
    //      | <name>([<expr> [, <expr>]*]?)
    //| { tag: "classinit", name:string}
    //| { tag: "methodcall", object: Expr, name:string, args:Expr[]}
    case "CallExpression":
      c.firstChild();
      //@ts-ignore
      if (c.type.name=="VariableName") {
        const callName = s.substring(c.from, c.to);
        c.nextSibling()
        const args = traverseArgList(c, s)
        c.parent()
        if (callName == 'print') {
          return {
            tag: "callexpr",
            name: callName,
            args:args,
            type:null
          }
        }
        else {
          if (args.length>0) throw new Error("class constructor with parameter is not supported")
          return {
            tag: "classinit",
            name: callName,
            type: null
          }
        }
      }
      //@ts-ignore
      else if(c.type.name=="MemberExpression") {
        c.firstChild()
        const object = traverseExpr(c, s)
        c.nextSibling()
        c.nextSibling()
        const name = s.substring(c.from, c.to)
        c.parent()
        c.nextSibling()
        const args = traverseArgList(c, s)
        c.parent()
        return {
          tag: "methodcall",
          object: object,
          name: name, 
          args:args,
          type:null
        }
      }
      else throw new Error("unrecognized call expression")
    //| { tag: "fieldquery", object: Expr, name: string}
    case "MemberExpression":
      c.firstChild()
      console.log(`member first child: |${s.substring(c.from, c.to)}|`)
      console.log(`c_range: ${c.from}, ${c.to}`)
      const object = traverseExpr(c,s)
      c.nextSibling()
      c.nextSibling()
      console.log(`member field: |${s.substring(c.from, c.to)}|`)
      const name = s.substring(c.from, c.to)
      console.log(`field return: |${s.substring(c.from, c.to)}|`)
      c.parent()
      return {
        tag: "fieldquery",
        object: object,
        name: name,
        type:null
      }
    //| { tag: "print", value: Expr}

    default:
      console.log(`unrecognized expr: ${s.substring(c.from, c.to)}, node name= ${c.type.name}`)
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseBody(c : TreeCursor, s : string) : Stmt[] {
  const stmts: Stmt[] = []
  c.firstChild();
  while(c.nextSibling()) {
    const stmt = traverseStmt(c, s)
    stmts.push(stmt)
    console.log(`traverseBody: stmt tag: ${stmt.tag}`)
  }
  c.parent()
  return stmts
}

export function traverseStmt(c : TreeCursor, s : string) : Stmt {
  console.log(`traverseStmt: node=${c.type.name}, content=|${s.substring(c.from, c.to)}|`)
  switch(c.node.type.name) {
    //stmt := <name> = <expr>
    case "AssignStatement":
      c.firstChild(); // go to name
      if (c.type.name=="VariableName") {
        const name = s.substring(c.from, c.to);
        c.nextSibling(); // go to equals
        c.nextSibling(); // go to value
        const value:Expr = traverseExpr(c, s);
        c.parent();
        return {
          tag: "assign",
          name: name,
          value: value
        }
      }
      else {
        // c: memberexpr
        c.firstChild()
        console.log(`traverseMemberAssign, object=|${s.substring(c.from, c.to)}|`)
        const object = traverseExpr(c, s)
        c.nextSibling()
        c.nextSibling()
        console.log(`traverseMemberAssign, name=|${s.substring(c.from, c.to)}|`)
        const name = s.substring(c.from, c.to);
        c.parent()
        c.nextSibling(); // go to equals
        c.nextSibling(); // go to value
        const value:Expr = traverseExpr(c, s);
        c.parent()
        return {
          tag: "fieldassign",
          object: object,
          name: name,
          value: value
        }

      }
    //  | if <expr>: <stmt>+ [elif <expr>: <stmt>+]? [else: <stmt>+]?
    case "IfStatement":
      c.firstChild();
      c.nextSibling();
      const if_cond = traverseExpr(c, s)
      c.nextSibling();
      const then_block = traverseBody(c, s)
      let elif_cond:Expr = null
      let elifStmt:Stmt = null
      let elif_block:Stmt[] = []
      let else_block:Stmt[] = []
      if (c.nextSibling()) {
        if (c.type.name =="elif") {
          // elif, cond, elif_block
          c.nextSibling()
          elif_cond = traverseExpr(c, s)
          c.nextSibling()
          const elifThen = traverseBody(c, s)
          c.nextSibling()
          elifStmt = {
            tag: "if",
            cond: elif_cond,
            then_block: elifThen,
            elif_block: [],
            else_block: []
          }
          elif_block.push(elifStmt)
        }
        if (c.type.name == "else") {
          c.nextSibling()
          c.nextSibling()
          const elseBody = traverseBody(c, s)
          if (elifStmt!=null) {
            //@ts-ignore
            elifStmt.else_block = elseBody
          }
          else {
            else_block = elseBody
          }
        }
      }
      c.parent();
      return {
        tag: "if",
        cond: if_cond,
        then_block: then_block,
        elif_block: elif_block,
        else_block: else_block
      }
    //  | while <expr>: <stmt>+
    case "WhileStatement":
      c.firstChild() // while
      c.nextSibling()
      const while_cond = traverseExpr(c, s)
      c.nextSibling()
      const body = traverseBody(c,s)
      c.parent()
      return {
        tag: "while",
        cond: while_cond,
        body: body
      }
    //  | pass
    case "PassStatement":
      return {
        tag: "pass"
      }
    //  | return <expr>?
    case "ReturnStatement":
      c.firstChild()
      let returnValue:Expr = {tag: "literal", value: {tag:"none", type:null}, type:null}
      if(c.nextSibling()) {
        returnValue = traverseExpr(c, s)
      }
      c.parent()
      return {
        tag: "return", 
        value: returnValue
      }

    //  | <expr>
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); // pop going into stmt
      return { tag: "expr", expr: expr }
    default:
      console.log(`unrecognized stmt: |${s.substring(c.from, c.to)}|, node type=${c.type.name}`)
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseTypedVar(c : TreeCursor, s : string) : TypedVar {
  if (c.node.type.name=="VariableName" || "self") {
    const name = s.substring(c.from, c.to);
    c.nextSibling();
    if (c.type.name == "TypeDef") {
      c.firstChild()
      c.nextSibling()
      const type = s.substring(c.from, c.to)
      c.parent()
      return {name:name, type:type}
    }
    else {
      throw new Error("TypedVar has invalid type")
    }
  }
  else {
    console.log(`at traverserTypedVar (${s.substring(c.from,c.to)})`)
    throw new Error("TypedVar should start with string")
  }
}

function traverseArgList(c : TreeCursor, s : string) : Expr[] {
  const argList:Expr[] = []
  c.firstChild()
  c.nextSibling()
  if (s.substring(c.from, c.to) != ')') {
    argList.push(traverseExpr(c, s))
    c.nextSibling()
    //@ts-ignore
    while(c.type.name == ",") {
      c.nextSibling()
      argList.push(traverseExpr(c, s))
      c.nextSibling()
    }
  }
  c.parent()
  return argList
}

function traverseTypedArgList(c : TreeCursor, s : string) : TypedVar[] {
  console.log(`traverseTypedArgList: ${s.substring(c.from, c.to)}`)
  const argList = []
  c.firstChild()
  c.nextSibling()
  if (s.substring(c.from, c.to) != ')') {
    argList.push(traverseTypedVar(c, s))
    c.nextSibling()
    //@ts-ignore
    while(c.type.name == ",") {
      c.nextSibling()
      argList.push(traverseTypedVar(c, s))
      c.nextSibling()
    }
  }
  c.parent()
  return argList
}

export function isBasicType(type:string): boolean {
  return (type=="int") || (type=="bool") || (type=="none")
}

export function traverseVarDef(c: TreeCursor, s:string) : VarDef {
  c.firstChild()
  const name = s.substring(c.from, c.to)
  c.nextSibling()
  const type = s.substring(c.from+1, c.to)
  c.nextSibling()
  c.nextSibling()
  const literal = traverseLiteral(c, s)
  c.parent()
  return {
      name: name,
      type: type,
      value: literal
  }
}

export function traverseDef(c : TreeCursor, s : string) : Def {
  console.log(`traverseDefs :|${s.substring(c.from, c.to)}|`)
  let def:Def = null;
  if (isVarDef(c,s))
    def = {tag:"var", def:traverseVarDef(c, s)}
  else {
    if (isFuncDef(c,s))
      def = {tag:"func", def:traverseFuncDef(c, s)}
    else if (isClassDef(c,s))
      def = {tag:"class", def:traverseClassDef(c, s)}
    else throw new Error("Invalid definition")
  }
  return def;
}

export function isDef(c:TreeCursor, s:string) : boolean {
  return isVarDef(c, s) || isFuncDef(c,s) || isClassDef(c,s)
}

export function isVarDef(c:TreeCursor, s:string) : boolean {
  if (c.type.name!="AssignStatement")
    return false
  c.firstChild()
  c.nextSibling()
  //@ts-ignore
  if (c.type.name!="TypeDef") {
    c.parent()
    return false
  }
  c.parent()
  return true
}

export function isFuncDef(c:TreeCursor, s:string) : boolean {
  if (c.type.name=="FunctionDefinition")
    return true
  else return false
}

export function isClassDef(c:TreeCursor, s:string) : boolean {
  if (c.type.name=="ClassDefinition")
    return true
  else return false
}

export function traverseFuncBody(c : TreeCursor, s : string) : FuncBody {
  c.firstChild()
  if (!c.nextSibling()) {
    throw new Error("function with no statement")
  }
  const varDefs:VarDef[] = []
  do {
    if (!isVarDef(c,s))
      break
    const varDef = traverseVarDef(c, s)
    varDefs.push(varDef)
  }
  while (c.nextSibling())
  if (isVarDef(c,s)) {
    throw new Error("function with no statement")
  }
  const body:Stmt[] = []
  do {
    const stmt = traverseStmt(c, s)
    body.push(stmt)
  }
  while (c.nextSibling())
  c.parent()
  return {defs: varDefs, body:body}
}

export function traverseFuncDef(c : TreeCursor, s : string, className: string='') : FuncDef {
  switch (c.node.type.name) {
    case "FunctionDefinition":
      c.firstChild() // def
      c.nextSibling() // func name
      const name = s.substring(c.from, c.to)
      c.nextSibling() // arglist
      const args = traverseTypedArgList(c, s)
      c.nextSibling() // typedef
      let returnType = 'none'
      if (c.type.name=='TypeDef') {
        c.firstChild() // type
        returnType=s.substring(c.from, c.to)
        c.parent()
      }
      c.nextSibling()
      const funcBody = traverseFuncBody(c, s)
      c.parent()
      return {
        name: name,
        typed_args: args,
        ret_type: returnType,
        body: funcBody
      }
    default:
      throw new Error("invalid function definition")
  }
}

export function traverseClassDef(c: TreeCursor, s:string): ClassDef {
  switch(c.node.type.name) {
    case "ClassDefinition":
      c.firstChild()
      c.nextSibling()
      const className = s.substring(c.from, c.to)
      c.nextSibling()
      c.nextSibling()
      c.firstChild()
      c.nextSibling()
      let defs:Def[] = []
      do {
        if (!isDef(c,s))
          break
        const def = traverseDef(c, s)
        defs.push(def)
      }
      while(c.nextSibling())
      c.parent()
      c.parent()
      return {
        defs: defs,
        name: className
      }
    default:
      throw new Error("Invalid Definition");
  }
}

export function traverse(c : TreeCursor, s : string) : Program {
  switch(c.node.type.name) {
    case "Script":
      if(!c.firstChild()) {
        c.parent()
        return {
          defs: [],
          body: []
        }
      }
      let defs:Def[] = []
      do {
        console.log(`traverse loop def traversal: |${s.substring(c.from, c.to)}|`)
        if (!isDef(c,s)) {
          console.log(`is not def!`)
          break
        }
        console.log(`is def!`)
        defs.push(traverseDef(c, s))
        console.log(`traverse loop def traversal end: |${s.substring(c.from, c.to)}|`)
      }
      while(c.nextSibling())
      console.log(`traverse loop stmt`)
      const stmts = [];
      if (!isDef(c,s)) {
        do {
          console.log(`traverse loop stmt :${s.substring(c.from, c.to)}`)
          stmts.push(traverseStmt(c, s));
        } while(c.nextSibling())
      }
      c.parent()
      return {
        defs: defs,
        body: stmts
      }
    default:
      throw new Error("Could not parse program at " + c.node.from + " " + c.node.to);
  }
}
export function parse(source : string) : Program {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}