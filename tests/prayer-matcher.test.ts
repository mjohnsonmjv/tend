import {test} from "node:test";
import assert from "node:assert/strict";
import {buildKeywordSet,matchTranscript,buildKeyterms,oneEditAway,tokenize} from "../client/src/lib/prayerMatcher";
import type {PrayerRequest} from "../shared/schema";

const row=(v:Partial<PrayerRequest>):PrayerRequest=>({id:1,churchId:1,submitterName:"Sarah Miller",submitterPhone:null,submitterEmail:null,submitterPhotoUrl:null,submitterPhotoPath:null,message:"Knee surgery next week",category:"prayer",isAnonymous:false,isUrgent:false,isPrivate:true,status:"new",pastorNotes:null,createdAt:1000,...v});
const req1=row({id:1,submitterName:"Sarah Miller",message:"Knee surgery next week for my mom"});
const req2=row({id:2,submitterName:"David Chen",message:"Job interview on Friday, wisdom and peace"});
const req3=row({id:3,submitterName:"Hidden",isAnonymous:true,message:"Marriage is struggling, need hope"});
const sets=[req1,req2,req3].map(buildKeywordSet);

test("tokenize lowercases, strips accents/possessives/punctuation",()=>{
  assert.deepEqual(tokenize("Sarah's Knee-Surgery!"),["sarah","knee-surgery"]);
  assert.deepEqual(tokenize("José García"),["jose","garcia"]);
});

test("keyword set keeps names and distinctive words, drops stopwords",()=>{
  const s=buildKeywordSet(req1);
  assert.ok(s.names.includes("sarah")&&s.names.includes("miller"));
  assert.ok(s.keywords.includes("knee")&&s.keywords.includes("surgery"));
  assert.ok(!s.keywords.includes("for")&&!s.keywords.includes("my"));
});

test("anonymous requests get no name keywords",()=>{
  const s=buildKeywordSet(req3);
  assert.deepEqual(s.names,[]);
  assert.ok(s.keywords.includes("marriage"));
});

test("spoken name plus topic checks off the request",()=>{
  assert.deepEqual(matchTranscript(sets,"Father we lift up Sarah and her knee surgery"),[1]);
});

test("two keyword hits match without a name",()=>{
  assert.deepEqual(matchTranscript(sets,"we pray for the knee surgery happening next week"),[1]);
});

test("distinctive first name alone matches",()=>{
  assert.deepEqual(matchTranscript(sets,"I want to pray for David today"),[2]);
});

test("full name parts both present match",()=>{
  assert.deepEqual(matchTranscript(sets,"remember David Chen in your prayers"),[2]);
});

test("one sentence can match two requests",()=>{
  const ids=matchTranscript(sets,"we pray for Sarah's surgery and for David's job interview");
  assert.deepEqual(ids.sort(),[1,2]);
});

test("unrelated prayer matches nothing",()=>{
  assert.deepEqual(matchTranscript(sets,"thank you for the sunshine and this beautiful morning"),[]);
});

test("stopwords alone never match",()=>{
  assert.deepEqual(matchTranscript(sets,"please pray for the"),[]);
});

test("single common keyword is not enough",()=>{
  assert.deepEqual(matchTranscript(sets,"next"),[]);
});

test("single-keyword request matches on that one word",()=>{
  const r=row({id:7,submitterName:"",isAnonymous:true,message:"My family"});
  const s=[buildKeywordSet(r)];
  assert.deepEqual(s[0].keywords,["family"]);
  assert.deepEqual(matchTranscript(s,"Father I lift up my family to you"),[7]);
  assert.deepEqual(matchTranscript(s,"thank you for this beautiful morning"),[]);
});

test("one-edit misspelling of a long keyword still matches",()=>{
  assert.ok(oneEditAway("surgery","surgury"));
  assert.ok(!oneEditAway("surgery","sugar"));
  assert.deepEqual(matchTranscript(sets,"praying for the knee surgury next week"),[1]);
});

test("unicode names match case-insensitively",()=>{
  const r=row({id:9,submitterName:"José García",message:"Healing after the accident"});
  const ids=matchTranscript([buildKeywordSet(r)],"we lift up Jose Garcia for healing");
  assert.deepEqual(ids,[9]);
});

test("keyterms lead with names and respect limits",()=>{
  const terms=buildKeyterms([req1,req2,req3]);
  assert.ok(terms.indexOf("sarah")<terms.indexOf("knee"),"names come first");
  assert.ok(terms.length<=50&&terms.every(t=>t.length<=20));
  assert.ok(!terms.includes("hidden"),"anonymous names are excluded");
});
