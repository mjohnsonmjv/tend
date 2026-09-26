import {test} from "node:test";
import assert from "node:assert/strict";
import {trackPageView,trackSignupStarted,trackSignupCompleted,trackPrayerSubmitted,isAnalyticsEnabled,currentHashPath} from "../client/src/lib/analytics";

type Call=[string,string,Record<string,unknown>?];
function withGtag(fn:(calls:Call[])=>void){
  const calls:Call[]=[];
  const g=(globalThis as unknown as Record<string,unknown>);
  const prev=g.window;
  g.window={gtag:(...a:unknown[])=>{calls.push(a as Call)},location:{origin:"https://tendpray.com",hash:""}};
  try{fn(calls)}finally{if(prev===undefined)delete g.window;else g.window=prev}
}
function withoutWindow(fn:()=>void){
  const g=(globalThis as unknown as Record<string,unknown>);
  const prev=g.window;
  delete g.window;
  try{fn()}finally{if(prev!==undefined)g.window=prev}
}

test("analytics helpers are silent when gtag is absent",()=>{
  withoutWindow(()=>{
    assert.equal(isAnalyticsEnabled(),false);
    trackPageView("/pricing");trackSignupStarted();trackSignupCompleted();trackPrayerSubmitted();
  });
});

test("page views strip query strings and use hash paths",()=>{
  withGtag(calls=>{
    trackPageView("/pricing?plan=starter");
    assert.equal(calls.length,1);
    assert.equal(calls[0][1],"page_view");
    assert.equal((calls[0][2] as Record<string,unknown>).page_path,"/#/pricing");
  });
});

test("signup events use anonymous params only",()=>{
  withGtag(calls=>{
    trackSignupStarted();trackSignupCompleted();
    assert.deepEqual(calls.map(c=>c[1]),["signup_started","sign_up"]);
    for(const c of calls){
      const params=JSON.stringify(c[2]??{});
      assert.ok(!/pray|prayer|email|phone|name/i.test(params.replace(/"method":"church_signup"/g,"")));
    }
  });
});

test("prayer submissions are anonymous counts with no payload",()=>{
  withGtag(calls=>{
    trackPrayerSubmitted();
    assert.equal(calls.length,1);
    assert.equal(calls[0][1],"prayer_request_submitted");
    assert.deepEqual(calls[0][2],{});
  });
});

test("currentHashPath defaults to root without a window",()=>{
  withoutWindow(()=>{assert.equal(currentHashPath(),"/")});
});
