# CS231 FA20 PA1 Writeup
## Yiran Wu, A59004775

## Q1: Representation of values
I use two slightly different representations for values in TypeScript and WebAssembly.

In TypeScript, all three types are represented by a string denoting its type ('int', 'bool' or 'none') and a TS number type storing its value (integer for int, 0/1 for bool, and undefined for none).

I adopted a static-type design, so that types only live in TS for typechecking. For WASM everything is just i32, representing its value.

For example "X:int=100" is {type:"int", value:100} in TS, and "(i32.const 100)" in WASM.

"X:bool=True" is {type:"bool", value:1} in TS, and "(i32.const 1)" in WASM.

"X:none=None" is {type:"none"} in TS, and since none is purely for typechecking, we don't need to worry about it in WASM.


## Q2: Data Structures
I use a class called Scope to store information about the variables and functions in the current scope. Given the name of variable, we are able to find its type (for typechecking) and address in WASM memory(for REPL). Given the name of function, we can find its signature(for typechecking) and WASM code implementation(for REPL).
```
type  VarEntry = {

type:string,

address: number

}

  
type  FuncEntry = {

type:string,

argList:string[],

source: string[]

}


export  class  Scope {

vars: Map <string, VarEntry>;

funcs: Map <string, FuncEntry>;

name:string;

memoryCounter: number

super: Scope;

constructor(superEnv: Scope, name:string)

mergeInto(env: Scope)

getVar(name:string) : VarEntry 

getFunc(name:string) : FuncEntry

close()

}
```
### Global Variables
```
X:int=1
```
corresponds to a Scope with variable map
```
scope.vars= ('X', [type: "int", address: 0])
```

In WASM runtime, the value of variable X will be stored in variable $X.

To pass value of global variable across runs, we utilize a shared memory. Every global variable will be assigned a unique position in memory. This address lookup table lives in TS. Before each WASM run starts, the formerly defined variables are fetched from memory by referring to its address. Before each run finishes, we update the memory with its current value.

### Functions
```
def foo(X:int, Y:int) -> bool {
  body
}
```
corresponds to a Scope with function map
```
scope.funcs = ('foo', [type: "bool", argList:["int","int"], source: wasmCodeOfArgAndBody])
```

Similar to global variables, we store the WASM code for global functions, and insert former functions before each WASM run.

### Local variables in function
```
def foo(X:int, Y:int) -> bool {
  Z:int=0
  body
}
```
corresponds to a hierarchy of scopes:
```
outerScope.funcs = ('foo', [type: "bool", argList:["int","int"], source: wasmCodeOfArgAndBody])
innerScope.vars = ('Z', [type: "int", address: 2])
innerScope.super = outerScope
```

We keep a map for all global variables and functions. After each REPL evaluation, the newly defined entities are added to this map. This is done by calling Scope.mergeInto on the outmost Scope. Information in all the inner Scopes are simply discarded.

## Q3: Infinite loops
Consider this program
```
X:bool=True
Y:bool=True
while X:
  Y=True
```
Running this program on the webpage will cause the page to idle and then probably crash.

## Q4: Various scenarios

## 4.1 Function defined in main, called in REPL
```
def foo(X:int) -> int:
  Y:int=0
  while X>0:
    X=X-1
    Y=Y+1
  return Y

----REPL----
foo(5)
```

![ScreenShot](images/4-1.png)

## 4.2 REPL calling main, REPL calling REPL
```
def foo(X:int) -> int:
  Y:int=0
  while X>0:
    X=X-1
    Y=Y+1
  return Y

----REPL----
def bar(X:int) -> int:    return (foo(X)//2)
```


![ScreenShot](images/4-2.png)

## 4.3 TypeError for arithmetic op
```
X:int=1
Y:bool=True
X+Y
```


![ScreenShot](images/4-3.png)

## 4.4 TypeError for if condition
```
X:int=0
Y:int=1
Z:int=2
C:int=3
if C:
  X=Y
else:
  X=Z
X
```

![ScreenShot](images/4-4.png)

## 4.5 Calling in a loop
```
def isEven(X:int) -> bool:
  return (X%2)==0

I:int=0
N:int=0
while (I<10):
  if isEven(I):
    N=N+1
  I=I+1
N
```

![ScreenShot](images/4-5.png)

## 4.6 Printing
```
Y:bool=True
X:int=100
X

---REPL1---
print(Y)
---REPL2---
print(X)
```
![ScreenShot](images/4-6.png)

Note: I use 0/1 representation for bools for simplicity. The string representation can be acquired by having some sort of convention about type representation in WASM (e.g. top 32-bit is 1), and then do post-processing in TypeScript before output to screen.

## 4.7 Recursive Function
```
def countDown(X:int) -> int:
  if X==0:
    return 0
  return countDown(X-1)+1

I:int=10
countDown(10)
```

![ScreenShot](images/4-7.png)

## 4.8 Mutual calling
```
def countDownOne(X:int) -> int:
  if X<=0:
    return 0
  return countDownTwo(X-1)+1

def countDownTwo(X:int) -> int:
  if X<=0:
    return 0
  return countDownOne(X-2)+1

I:int=15
countDownOne(I)
```

![ScreenShot](images/4-8.png)