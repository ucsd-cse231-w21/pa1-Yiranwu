import {run} from './runner';
import {BasicREPL} from './repl';
import {Scope} from "./compiler"
import { experiments } from 'webpack';


function webStart() {
  document.addEventListener("DOMContentLoaded", function() {
    var importObject = {
      imports: {
        print: (typeEncoding:number, arg : any) => {
          let output=''
          switch (typeEncoding) {
            case 0:
              output = arg
              break
            case 2:
              if (arg==0) output='False'
              else output='True'
              break
            default:
              if (arg>0) output=repl.currentEnv.classIndexToName.get(typeEncoding>>1)
          }
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = output;
          return arg;
        },
        abs: (arg : any) => {
          return Math.abs(arg);
        },
        max: (arg1: number, arg2: number) => {
          return Math.max(arg1, arg2)
        },
        min: (arg1: number, arg2: number) => {
          return Math.min(arg1, arg2)
        },
        pow: (arg1: number, arg2: number) => {
          return Math.pow(arg1, arg2)
        },
      },
    };
    var repl = new BasicREPL(importObject);

    function renderResult(result : any) : void {
      if(result === undefined) { console.log("skip"); return; }
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = String(result);
    }

    function renderError(result : any) : void {
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.setAttribute("style", "color: red");
      elt.innerText = String(result);
    }

    function setupRepl() {
      document.getElementById("output").innerHTML = "";
      const replCodeElement = document.getElementById("next-code") as HTMLInputElement;
      replCodeElement.addEventListener("keypress", (e) => {
        if(e.key === "Enter") {
          const output = document.createElement("div");
          const prompt = document.createElement("span");
          prompt.innerText = "»";
          output.appendChild(prompt);
          const elt = document.createElement("input");
          elt.type = "text";
          elt.disabled = true;
          elt.className = "repl-code";
          output.appendChild(elt);
          document.getElementById("output").appendChild(output);
          const source = replCodeElement.value;
          elt.value = source;
          replCodeElement.value = "";
          //repl.run(source).then((r) => { renderResult(r); console.log ("run finished") })
          //    .catch((e) => { renderError(e); console.log("run failed", e) });;
          repl.run(source).then((r) => { renderResult(r); console.log ("run finished") })
              .catch((e) => { renderError(e); console.log("run failed", e) });;
        }
      });
    }

    document.getElementById("run").addEventListener("click", function(e) {
      repl = new BasicREPL(importObject);
      const source = document.getElementById("user-code") as HTMLTextAreaElement;
      setupRepl();
      repl.run(source.value).then((r) => { renderResult(r); console.log ("run finished") })
          .catch((e) => { renderError(e); console.log("run failed", e) });;
    });
  });
}

webStart();
