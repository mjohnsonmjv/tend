import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import {parseOAuthReturn} from "./lib/oauth-core";
import {OAuthReturn} from "./components/OAuthReturn";
import Recovery,{isRecoveryUrl} from "./pages/Recovery";

const root=createRoot(document.getElementById("root")!);
let callbackMode=false;
function start(){
  if(isRecoveryUrl(location.href)){
    callbackMode=true;
    root.render(<Recovery/>);
    return;
  }
  const payload=parseOAuthReturn(location.href);
  if(payload){
    callbackMode=true;
    // Remove codes, errors, and legacy tokens from the address bar before render.
    history.replaceState(null,"",location.pathname);
    root.render(<OAuthReturn payload={payload}/>);
    return;
  }
  callbackMode=false;
  if(!location.hash)history.replaceState(null,"",location.pathname+location.search+"#/");
  root.render(<App />);
}
window.addEventListener("hashchange",()=>{
  if(isRecoveryUrl(location.href)||parseOAuthReturn(location.href)||callbackMode)start();
});
start();
