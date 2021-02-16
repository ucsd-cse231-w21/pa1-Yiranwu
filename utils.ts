import { Value, Type } from "./ast";

export function PyValue(typ: Type, result: number, str:string=''): Value {
  switch (typ.tag) {
    case "number":
      return PyInt(result, str);
    case "bool":
      return PyBool(Boolean(result),str);
    case "class":
      return PyObj(typ.name, result,str);
    case "none":
      return PyNone(str);
  }
}

export function PyInt(n: number,str:string=''): Value {
  return { tag: "num", value: n, str:str };
}

export function PyBool(b: boolean,str:string=''): Value {
  return { tag: "bool", value: b, str:str };
}

export function PyObj(name: string, address: number,str:string=''): Value {
  if (address === 0) return PyNone(str);
  else return { tag: "object", name, address,str };
}

export function PyNone(str:string=''): Value {
  return { tag: "none" ,str:str};
}

export const NUM : Type = {tag: "number"};
export const BOOL : Type = {tag: "bool"};
export const NONE : Type = {tag: "none"};
export function CLASS(name : string) : Type {return {tag: "class", name}};