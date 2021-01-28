import {parser} from "lezer-python";
import {TreeCursor} from "lezer-tree";
import { createNamedExports, isConstructorDeclaration } from "typescript";
import {Expr, Stmt, Literal, FuncDef, VarDef, TypedVar, FuncBody, Def, Program} from "./ast";

export function traverseLiteral(c : TreeCursor, s : string) : Literal {
  switch (c.type.name) {
    case "Number":
      return {tag:"int" ,value: Number(s.substring(c.from, c.to)), type:"int"}
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
    case "CallExpression":
      c.firstChild();
      const callName = s.substring(c.from, c.to);
      c.nextSibling(); // go to arglist
      c.firstChild(); // go into arglist
      if (!c.nextSibling()) {
        c.parent()
        c.parent()
        throw new Error("CallExpression with zero argument is invalid")
      }
      //c.nextSibling(); // find single argument in arglist
      const args: Expr[] = [traverseExpr(c, s)];
      c.nextSibling();
      // @ts-ignore
      while (c.type.name==",") {
        c.nextSibling()
        args.push(traverseExpr(c, s));
        c.nextSibling()
      }
      c.parent(); // pop arglist
      c.parent(); // pop CallExpression
      return {
        tag: "callexpr",
        name: callName,
        args: args,
        type:null
      }
    /*
    case "CallExpression":
      c.firstChild();
      const callName = s.substring(c.from, c.to);
      c.nextSibling(); // go to arglist
      c.firstChild(); // go into arglist
      c.nextSibling(); // find single argument in arglist
      const arg = traverseExpr(c, s);
      c.nextSibling();
      // @ts-ignore
      if (c.type.name==",") {
        c.nextSibling()
        const arg2 = traverseExpr(c, s);
        c.parent(); // pop arglist
        c.parent(); // pop CallExpression
        return {
          tag: "builtin2", 
          name: callName, 
          arg1: arg, arg2:arg2
        };
      }
      else {
        c.parent(); // pop arglist
        c.parent(); // pop CallExpression
        return {
          tag: "builtin1",
          name: callName,
          arg: arg
        };
      }
    */

    default:
      throw new Error("Could not parse expr at " + c.from + " " + c.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseBody(c : TreeCursor, s : string) : Stmt[] {
  const stmts: Stmt[] = []
  c.firstChild();
  while(c.nextSibling()) {
    stmts.push(traverseStmt(c, s))
  }
  c.parent()
  return stmts
}

export function traverseStmt(c : TreeCursor, s : string) : Stmt {
  console.log(`traverseStmt: node=${c.type.name}, content=${s.substring(c.from, c.to)}|`)
  switch(c.node.type.name) {
    //stmt := <name> = <expr>
    case "AssignStatement":
      c.firstChild(); // go to name
      const name = s.substring(c.from, c.to);
      let type=null;
      c.nextSibling(); // go to equals
      c.nextSibling(); // go to value
      const value:Expr = traverseExpr(c, s);
      c.parent();
      return {
        tag: "assign",
        name: name,
        value: value
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
      throw new Error("Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + s.substring(c.from, c.to));
  }
}

export function traverseTypedVar(c : TreeCursor, s : string) : TypedVar {
  if (c.node.type.name=="VariableName") {
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
    throw new Error("TypedVar should start with string")
  }
}

export function traverseArgList(c : TreeCursor, s : string) : TypedVar[] {
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
      type:type,
      value:literal
  }
}

export function traverseDef(c : TreeCursor, s : string) : Def {
  console.log(`traverseDefs`)
  let def:Def = null;
  if (isVarDef(c,s))
    def = {tag:"var", def:traverseVarDef(c, s)}
  else {
    if (isFuncDef(c,s))
      def = {tag:"func", def:traverseFuncDef(c, s)}
  }
  return def;
}

export function isDef(c:TreeCursor, s:string) : boolean {
  return isVarDef(c, s) || isFuncDef(c,s)
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

export function traverseFuncDef(c : TreeCursor, s : string) : FuncDef {
  switch (c.node.type.name) {
    case "FunctionDefinition":
      c.firstChild() // def
      c.nextSibling() // func name
      const name = s.substring(c.from, c.to)
      c.nextSibling() // arglist
      const args = traverseArgList(c, s)
      c.nextSibling() // typedef
      c.firstChild() // type
      const returnType=s.substring(c.from, c.to)
      c.parent()
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
        if (!isDef(c,s))
          break
        defs.push(traverseDef(c, s))
      }
      while(c.nextSibling())
      const stmts = [];
      if (!isDef(c,s)) {
        do {
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