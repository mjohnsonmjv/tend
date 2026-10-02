import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import {parseOAuthReturn} from "./lib/oauth-core";
import {OAuthReturn} from "./components/OAuthReturn";
import {ErrorBoundary} from "./components/ErrorBoundary";
import {PcoReturn,parsePcoReturn} from "./components/PcoReturn";
import Recovery,{isRecoveryUrl} from "./pages/Recovery";

const root=createRoot(document.getElementById("root")!);
let callbackMode=false;
function renderApp(){
  callbackMode=false;
  if(!location.hash)history.replaceState(null,"",location.pathname+location.search+"#/");
  root.render(<ErrorBoundary><App /></ErrorBoundary>);
}
function start(){
  if(isRecoveryUrl(location.href)){
    callbackMode=true;
    root.render(<ErrorBoundary><Recovery/></ErrorBoundary>);
    return;
  }
  const pco=parsePcoReturn(location.href);
  if(pco){
    callbackMode=true;
    // Strip the one-time ticket from the address bar before render.
    history.replaceState(null,"",location.pathname);
    root.render(<ErrorBoundary><PcoReturn ticket={pco.ticket} error={pco.error} onDone={renderApp}/></ErrorBoundary>);
    return;
  }
  const payload=parseOAuthReturn(location.href);
  if(payload){
    callbackMode=true;
    // Remove codes, errors, and legacy tokens from the address bar before render.
    history.replaceState(null,"",location.pathname);
    root.render(<ErrorBoundary><OAuthReturn payload={payload}/></ErrorBoundary>);
    return;
  }
  renderApp();
}
window.addEventListener("hashchange",()=>{
  if(isRecoveryUrl(location.href)||parsePcoReturn(location.href)||parseOAuthReturn(location.href)||callbackMode)start();
});
start();
