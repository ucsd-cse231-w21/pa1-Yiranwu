export type Program = {defs: Def[], body: Stmt[]}

export type Def = 
    {tag: "var", def: VarDef} 
  | {tag: "func", def: FuncDef}
  | {tag: "class", def: ClassDef}

export type VarDef = {name:string, type:string, value:Literal}

export type FuncDef = {name: string, typed_args: TypedVar[], ret_type: string, body:FuncBody}
// typed_args: 1 or more,  ret_type: optional

export type ClassDef  = {name: string, defs: Def[]}

export type FuncBody = {defs: VarDef[], body: Stmt[]}
// defs: 0 or more, body: 1 or more

export type Stmt =
    { tag: "assign", name: string, value: Expr }
  | { tag: "fieldassign", object: Expr, name: string, value: Expr}
  | { tag: "expr", expr: Expr }
  // below are new
  | { tag: "if", cond: Expr, then_block: Stmt[], elif_block: Stmt[], else_block: Stmt[]}
  // all stmts 1 or more, elif_block/else_block optional
  | { tag: "while", cond:Expr, body:Stmt[]}
  // body: 1 or more
  | { tag: "pass"}
  | { tag: "return", value: Expr}
  // value: optional

export type Expr =
    { tag: "id", name: string, type:string }
  | { tag: "binexpr", opd1: Expr, op: string, opd2: Expr, type:string}
  | { tag: "builtins", name: string, arg: Expr[], type:string}
  // below are new
  | { tag: "unaryexpr", opd: Expr, op: string, type:string}
  | { tag: "callexpr", name:string, args: Expr[], type:string}
  | { tag: "literal", value: Literal, type:string}
  | { tag: "classinit", name:string, type:string}
  | { tag: "fieldquery", object: Expr, name: string, type:string}
  | { tag: "methodcall", object: Expr, name:string, args:Expr[], type:string}


export type Literal = 
    { tag: "int", value:number, type:string}
  | { tag: "bool", value:boolean, type:string} 
  | { tag: "none", type:string}

export type TypedVar = 
  { name: string, type: string}

export type Value =
    { tag: "none", str?:string}
  | { tag: "bool", value: boolean, str?:string}
  | { tag: "num", value: number, str?:string}
  | { tag: "object", name: string, address: number, str?:string}

export type Type =
    {tag: "number"}
  | {tag: "bool"}
  | {tag: "none"}
  | {tag: "class", name: string}


