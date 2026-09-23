import {test} from "node:test";
import assert from "node:assert/strict";
import {filterPrayers,csvCell,prayerCsv} from "../client/src/lib/inbox";
import type {PrayerRequest} from "../shared/schema";
const row=(v:Partial<PrayerRequest>):PrayerRequest=>({id:1,churchId:1,submitterName:"Alex",submitterPhone:"555-0100",submitterEmail:null,message:"Pray for surgery",category:"prayer",isAnonymous:false,isUrgent:false,isPrivate:true,status:"new",pastorNotes:"Call Tuesday",createdAt:1000,...v});
const rows=[row({id:1}),row({id:2,status:"praying",isUrgent:true,createdAt:2000}),row({id:3,category:"praise",status:"prayed_for",isAnonymous:true,submitterName:"Hidden",message:"Thanks",createdAt:3000})];
test("search matches request and private notes without case sensitivity",()=>{assert.equal(filterPrayers(rows,"TUESDAY","all","all",false,"newest").length,3);assert.equal(filterPrayers(rows,"surgery","all","all",false,"newest").length,2)});
test("anonymous search never uses hidden submitter name",()=>{assert.equal(filterPrayers(rows,"Hidden","all","all",false,"newest").length,0);assert.equal(filterPrayers(rows,"Anonymous","all","all",false,"newest").length,1)});
test("filters combine and never mutate source order",()=>{assert.deepEqual(filterPrayers(rows,"","praying","prayer",true,"newest").map(p=>p.id),[2]);assert.deepEqual(rows.map(p=>p.id),[1,2,3])});
test("all sorting orders",()=>{assert.deepEqual(filterPrayers(rows,"","all","all",false,"oldest").map(p=>p.id),[1,2,3]);assert.deepEqual(filterPrayers(rows,"","all","all",false,"urgent").map(p=>p.id),[2,3,1])});
test("CSV escapes spreadsheet formulas and quotation marks",()=>{
  assert.equal(csvCell("=SUM(1,2)"),`"'=SUM(1,2)"`);
  assert.equal(csvCell('a"b'),`"a""b"`);
  assert.equal(csvCell("  +1"),`"'  +1"`);
});
test("export excludes contact data and private notes",()=>{const csv=prayerCsv(rows);assert.ok(!csv.includes("555-0100"));assert.ok(!csv.includes("Call Tuesday"));assert.ok(!csv.includes("Hidden"));assert.ok(csv.includes("Anonymous"));assert.ok(csv.includes("Request"))});
