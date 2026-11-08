import {test} from "node:test";
import assert from "node:assert/strict";
import {resolvePastorEmail} from "../client/src/lib/queryClient";

// Phone-first signup: the account may have no email yet, so church creation
// must resolve pastor_email from the address typed on the signup form, the
// signed-in account, or the address saved during phone signup. An empty
// result is what the tend_churches pastor_email check rejects, so it must
// never be sent to the database (the insert path throws a friendly error
// instead).
test("resolvePastorEmail prefers the address typed on the signup form",()=>{
  assert.equal(resolvePastorEmail("account@example.com","form@example.com","pending@example.com"),"form@example.com");
});
test("resolvePastorEmail falls back to the account email, then the pending email",()=>{
  assert.equal(resolvePastorEmail("account@example.com","","pending@example.com"),"account@example.com");
  assert.equal(resolvePastorEmail("","","pending@example.com"),"pending@example.com");
  assert.equal(resolvePastorEmail(""),"");
  assert.equal(resolvePastorEmail(null,undefined,null),"");
});
test("resolvePastorEmail trims whitespace and treats blank as missing",()=>{
  assert.equal(resolvePastorEmail("  ","  form@example.com  ",""),"form@example.com");
  assert.equal(resolvePastorEmail("   ","","   "),"");
});
