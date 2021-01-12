
export type Stmt =
  | { tag: "define", name: string, value: Expr }
  | { tag: "expr", expr: Expr }

export type Expr =
    { tag: "num", value: number }
  | { tag: "id", name: string }
  | { tag: "binexpr", value1: Expr, op: string, value2: Expr}
  | { tag: "builtin1", name: string, arg: Expr }
  | { tag: "buildin2", name: string, arg1: Expr, arg2: Expr}
