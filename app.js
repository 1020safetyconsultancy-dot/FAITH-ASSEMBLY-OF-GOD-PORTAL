import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const conf=window.CHURCH_CONFIG||{};
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n)||0);
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const notice=(msg,ok=false)=>{const n=$("#message");n.textContent=msg;n.className="message"+(ok?" ok":"")};
const configured=Boolean(conf.supabaseUrl&&conf.supabaseAnonKey);
const db=configured?createClient(conf.supabaseUrl,conf.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let role=null,memberCache=[],eventCache=[],activeTab="dashboard";
const authRoles={dashboard:["admin","pastor","board","secretary","attendance","treasurer"],members:["admin","pastor","board","secretary","attendance","treasurer"],attendance:["admin","pastor","secretary","attendance"],offerings:["admin","treasurer"],expenses:["admin","treasurer"],reports:["admin","treasurer"],accounts:["admin"]};
const can=t=>Boolean(role&&authRoles[t]?.includes(role));
const writableMembers=()=>["admin","secretary"].includes(role);
const canAttend=()=>["admin","secretary","attendance"].includes(role);
function opts(list,key="id",label="full_name"){return list.map(v=>'<option value="'+esc(v[key])+'">'+esc(v[label])+"</option>").join("")}
function table(head,rows){return '<div class="tablewrap"><table><thead><tr>'+head.map(h=>"<th>"+esc(h)+"</th>").join("")+'</tr></thead><tbody>'+(rows.length?rows.join(""):'<tr><td colspan="'+head.length+'" class="empty">No records yet</td></tr>')+'</tbody></table></div>'}
async function query(tableName,sel="*",order="created_at"){const {data,error}=await db.from(tableName).select(sel).order(order,{ascending:false}).limit(1000);if(error)throw error;return data||[]}
async function save(tableName,obj){const {error}=await db.from(tableName).insert(obj);if(error)throw error;notice("Record saved successfully.",true);await render()}
async function loadMembers(){memberCache=await query("members")}
async function loadEvents(){eventCache=await query("church_events","*","event_date")}
function formModal(title,fields,onSubmit){
 let dialog=document.querySelector("#entryDialog");if(dialog)dialog.remove();
 dialog=document.createElement("dialog");dialog.id="entryDialog";
 dialog.innerHTML='<h2>'+esc(title)+'</h2><form id="entryForm"><div class="grid">'+fields.map(f=>'<label>'+esc(f.label)+(f.type==="select"?'<select name="'+f.key+'">'+(f.options||"")+'</select>':f.type==="textarea"?'<textarea name="'+f.key+'"></textarea>':'<input name="'+f.key+'" type="'+(f.type||"text")+'" '+(f.required?"required":"")+' '+(f.value!==undefined?'value="'+esc(f.value)+'"':"")+'>')+'</label>').join("")+'</div><div class="formactions"><button type="button" class="ghost" id="cancelModal">Cancel</button><button type="submit">Save</button></div></form>';
 document.body.append(dialog);dialog.showModal();dialog.querySelector("#cancelModal").onclick=()=>dialog.close();
 dialog.querySelector("form").onsubmit=async e=>{e.preventDefault();const obj=Object.fromEntries(new FormData(e.target));for(const k of Object.keys(obj)){if(obj[k]==="")obj[k]=null;}const submit=e.target.querySelector('[type="submit"]');submit.disabled=true;try{await onSubmit(obj);dialog.close()}catch(err){notice(err.message)}finally{submit.disabled=false}};
}
async function start(){
 if(!configured){$("#setup").hidden=false;return}
 const {data:{session}}=await db.auth.getSession();if(new URLSearchParams(location.search).get("recovery")!=="1")await showSession(session);
 db.auth.onAuthStateChange((_e,s)=>{if(new URLSearchParams(location.search).get("recovery")==="1")return;setTimeout(()=>showSession(s),0)});
 const adminMode=()=>{ notice(""); $("#adminLogin").hidden=false;$("#staffLogin").hidden=true;$("#adminMode").classList.add("active");$("#staffMode").classList.remove("active"); };
 const staffMode=()=>{ notice(""); $("#adminLogin").hidden=true;$("#staffLogin").hidden=false;$("#staffMode").classList.add("active");$("#adminMode").classList.remove("active"); };
 $("#adminMode").onclick=adminMode;$("#staffMode").onclick=staffMode;
 if(new URLSearchParams(location.search).get("admin")==="1") adminMode(); else staffMode();
 $("#adminForm").onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector("button");button.disabled=true;notice("");try{const {data,error}=await db.auth.signInWithPassword({email:$("#adminEmail").value.trim(),password:$("#adminPassword").value});if(error)throw error;const {data:profile,error:roleError}=await db.from("staff_roles").select("role").eq("user_id",data.user.id).maybeSingle();if(roleError)throw roleError;if(profile?.role!=="admin"){await db.auth.signOut();throw Error("This account is not authorized as a church administrator.");}notice("Administrator signed in successfully.",true);}catch(err){notice(err.message==="Invalid login credentials"?"Invalid credentials. Confirm the administrator password in Supabase Authentication.":err.message)}finally{button.disabled=false;$("#adminPassword").value=""}};
 const resetUrl="https://1020safetyconsultancy-dot.github.io/FAITH-ASSEMBLY-OF-GOD-PORTAL/?recovery=1";
 const requestReset=async email=>{if(!email||!email.includes("@")){notice("Enter a valid email address first.");return;}notice("");const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:resetUrl});if(error){notice(error.message.includes("rate limit")?"Supabase email limit reached. Try again later or ask an administrator to reset your password in Supabase.":error.message);return;}notice("If the email account exists, a password reset link has been requested. Check inbox and spam. If email limits are active, delivery may be delayed.",true)};
 $("#adminForgot").onclick=()=>requestReset($("#adminEmail").value.trim());
 $("#staffForgot").onclick=()=>requestReset($("#email").value.trim());
 $("#resetForm").onsubmit=async e=>{e.preventDefault();const pass=$("#newPassword").value;if(pass!==$("#confirmPassword").value){notice("Passwords do not match.");return;}if(pass.length<12){notice("Use at least 12 characters.");return;}const {data:{session}}=await db.auth.getSession();if(!session){notice("Reset link is missing or expired. Request a new password reset email.");return;}const {error}=await db.auth.updateUser({password:pass});if(error){notice(error.message);return;}notice("Password updated successfully. Your account is signed in.",true);$("#resetScreen").hidden=true;history.replaceState(null,"",location.pathname);await showSession(session)};
 const isRecovery=new URLSearchParams(location.search).get("recovery")==="1";
 if(isRecovery){$("#auth").hidden=true;$("#portal").hidden=true;$("#resetScreen").hidden=false;}
 $("#loginForm").onsubmit=async e=>{e.preventDefault();notice("");const {error}=await db.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});if(error)notice(error.message)};
}
async function showSession(session){
 $("#auth").hidden=!!session;$("#portal").hidden=!session;
 if(!session){role=null;$("#account").replaceChildren();return}
 const {data,error}=await db.from("staff_roles").select("role").eq("user_id",session.user.id).maybeSingle();
 if(error)notice(error.message);
 role=data?.role||null;
 $("#account").innerHTML='<span>'+esc(session.user.email)+' · '+esc(role||"Role pending")+'</span> <button class="ghost" id="changePassword">Change password</button> <button class="ghost" id="logout">Sign out</button>';
 $("#logout").onclick=()=>db.auth.signOut();
 $("#changePassword").onclick=()=>formModal("Change your password",[
  {key:"new_password",label:"New password (at least 12 characters)",type:"password",required:true},
  {key:"confirm_password",label:"Confirm new password",type:"password",required:true}
 ],async o=>{if(!o.new_password||o.new_password.length<12)throw Error("Use at least 12 characters");if(o.new_password!==o.confirm_password)throw Error("Passwords do not match");const {error}=await db.auth.updateUser({password:o.new_password});if(error)throw error;notice("Password updated successfully.",true)});

 if(!role){$("#portal").hidden=false;$("#tabs").innerHTML="";$("#view").innerHTML='<section class="panel"><h2>Awaiting staff authorization</h2><p>An administrator must assign your account a staff role in Supabase.</p></section>';return}
 nav();await render();
}
function nav(){const list=[["dashboard","Overview"],["members","Members"],["attendance","Attendance"],["offerings","Tithes & Offerings"],["expenses","Expenses"],["reports","Reports"],["accounts","Accounts"]];
 $("#tabs").innerHTML=list.filter(([key])=>can(key)).map(([key,label])=>'<button data-tab="'+key+'" class="'+(activeTab===key?"active":"")+'">'+label+"</button>").join("");
 $("#tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;nav();render()});
}
async function render(){try{if(!can(activeTab))activeTab="dashboard";const v=$("#view");v.innerHTML='<section class="panel">Loading records…</section>';if(activeTab==="dashboard")await dashboard();else if(activeTab==="members")await members();else if(activeTab==="attendance")await attendance();else if(activeTab==="offerings")await finance("offerings");else if(activeTab==="expenses")await finance("expenses");else if(activeTab==="accounts")await accounts();else await reports()}catch(e){$("#view").innerHTML='<section class="panel"><h2>Unable to load section</h2><p>'+esc(e.message)+'</p></section>';notice(e.message)}}
async function dashboard(){await loadMembers();const events=await query("church_events","*","event_date");const att=role==="board"?[]:await query("attendance");let offerings=[],expenses=[];if(can("reports")){offerings=await query("offerings");expenses=await query("expenses")}
 const total=(xs)=>xs.filter(x=>!x.voided_at).reduce((sum,x)=>sum+Number(x.amount),0);
 const stats=[["Active members",memberCache.filter(x=>x.status==="active").length],["Members this month",memberCache.filter(x=>(x.member_since||"").startsWith(today().slice(0,7))).length],["Recorded check-ins",att.length],["Church events",events.length]];
 if(can("reports"))stats.push(["Offerings",money(total(offerings))],["Expenses",money(total(expenses))],["Balance",money(total(offerings)-total(expenses))]);
 $("#view").innerHTML='<h1>Church Overview</h1><p>Welcome to the Faith Assembly of God staff portal.</p><div class="stats">'+stats.map(([label,value])=>'<div class="stat"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join("")+'</div><section class="panel" style="margin-top:18px"><h2>Upcoming and recent services</h2>'+table(["Date","Service/Event","Type"],events.slice(0,8).map(e=>'<tr><td>'+esc(e.event_date)+'</td><td>'+esc(e.title)+'</td><td>'+esc(e.event_type)+'</td></tr>'))+'</section>'}
async function members(){await loadMembers();const v=$("#view");v.innerHTML='<section class="panel"><div class="sectionhead"><h1>Member Directory</h1>'+(writableMembers()?'<button id="addMember">+ Add member</button>':"")+'</div><div class="toolbar"><input id="searchMembers" placeholder="Search names, ministry, status" aria-label="Search members"></div><div id="memberTable"></div></section>';
 const draw=()=>{const q=$("#searchMembers").value.toLowerCase();const list=memberCache.filter(m=>[m.full_name,m.ministry,m.status].some(x=>String(x||"").toLowerCase().includes(q)));$("#memberTable").innerHTML=table(["Name","Membership started","Ministry","Status","Contact",...(writableMembers()?["Action"]:[])],list.map(m=>'<tr><td>'+esc(m.full_name)+'</td><td>'+esc(m.member_since)+'</td><td>'+esc(m.ministry)+'</td><td><span class="badge">'+esc(m.status)+'</span></td><td>'+esc(m.phone)+'</td>'+(writableMembers()?'<td><button class="ghost small" data-edit="'+esc(m.id)+'">Edit</button></td>':"")+'</tr>'));$("#memberTable").querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>memberEditor(memberCache.find(m=>m.id===btn.dataset.edit)))};
 $("#searchMembers").oninput=draw;draw();if(writableMembers())$("#addMember").onclick=()=>memberEditor();
}
function memberEditor(m){formModal(m?"Edit member":"Register member",[
 {key:"full_name",label:"Full name",required:true,value:m?.full_name||""},{key:"member_since",label:"Membership starting date",type:"date",required:true,value:m?.member_since||today()},
 {key:"phone",label:"Contact number",value:m?.phone||""},{key:"email",label:"Email",type:"email",value:m?.email||""},
 {key:"ministry",label:"Ministry / Group",value:m?.ministry||""},{key:"status",label:"Status",type:"select",options:["active","inactive","transferred"].map(s=>'<option '+(m?.status===s?"selected":"")+' value="'+s+'">'+s+"</option>").join("")},
 {key:"address",label:"Address",value:m?.address||""},{key:"birthday",label:"Birthday",type:"date",value:m?.birthday||""},
 {key:"baptism_date",label:"Baptism date",type:"date",value:m?.baptism_date||""},{key:"notes",label:"Notes",type:"textarea"}
 ],async data=>{data.consent_recorded=!!m?.consent_recorded;if(m){const {error}=await db.from("members").update(data).eq("id",m.id);if(error)throw error;notice("Member updated.",true);await render()}else await save("members",data)})}
async function attendance(){await Promise.all([loadMembers(),loadEvents()]);const checks=await query("attendance");const v=$("#view");v.innerHTML='<section class="panel"><div class="sectionhead"><h1>Attendance</h1>'+(canAttend()?'<button id="newEvent">+ New service/event</button>':"")+'</div><div class="toolbar"><label>Choose service<select id="eventSelect">'+opts(eventCache,"id","title")+'</select></label>'+(canAttend()?'<button id="checkIn">+ Check in member</button>':"")+'</div><div id="checks"></div></section>';
 const sel=$("#eventSelect");if(!eventCache.length){$("#checks").innerHTML='<p>No services created yet.</p>';if($("#checkIn"))$("#checkIn").disabled=true}else{const draw=()=>{const selected=eventCache.find(e=>e.id===sel.value);const filtered=checks.filter(x=>x.event_id===sel.value);$("#checks").innerHTML='<h3>'+esc(selected?.title)+' · '+esc(selected?.event_date)+' · '+filtered.length+' present</h3>'+table(["Member","Checked in",...(canAttend()?["Action"]:[])],filtered.map(a=>'<tr><td>'+esc(memberCache.find(m=>m.id===a.member_id)?.full_name||"Unknown")+'</td><td>'+esc(new Date(a.checked_in_at).toLocaleString("en-PH",{timeZone:"Asia/Manila"}))+'</td>'+(canAttend()?'<td><button class="ghost" data-remove="'+esc(a.id)+'">Undo</button></td>':"")+'</tr>'));$("#checks").querySelectorAll("[data-remove]").forEach(b=>b.onclick=async()=>{if(!confirm("Remove this check-in?"))return;const {error}=await db.from("attendance").delete().eq("id",b.dataset.remove);if(error)notice(error.message);else await render()})};sel.onchange=draw;draw()}
 if(canAttend()){ $("#newEvent").onclick=()=>formModal("Create service / event",[{key:"title",label:"Title",required:true},{key:"event_date",label:"Date",type:"date",value:today(),required:true},{key:"event_type",label:"Event type",value:"Sunday Service"}],o=>save("church_events",o));$("#checkIn").onclick=()=>formModal("Member check-in",[{key:"member_id",label:"Member",type:"select",options:opts(memberCache)}],async o=>{if(!o.member_id)throw Error("No member available");await save("attendance",{event_id:sel.value,member_id:o.member_id})})}
}
async function finance(kind){const isOffer=kind==="offerings",items=await query(kind,"*","entry_date");await loadMembers();const v=$("#view");
 v.innerHTML='<section class="panel"><div class="sectionhead"><h1>'+(isOffer?"Tithes & Offerings":"Expenses")+'</h1><button id="newFinance">+ Record '+(isOffer?"offering":"expense")+'</button></div><div class="toolbar"><label>Filter month<input id="financeMonth" type="month" value="'+today().slice(0,7)+'"></label><button id="allFinance" class="ghost">Show all</button></div><div id="financeTable"></div></section>';
 const draw=()=>{const m=$("#financeMonth").value,filtered=items.filter(x=>!m||x.entry_date.startsWith(m));const total=filtered.filter(x=>!x.voided_at).reduce((sum,x)=>sum+Number(x.amount),0);$("#financeTable").innerHTML='<h3>Total: '+money(total)+'</h3>'+table(["Date","Category","Amount",isOffer?"Donor":"Details","Status","Action"],filtered.map(x=>'<tr><td>'+esc(x.entry_date)+'</td><td>'+esc(x.category)+'</td><td>'+money(x.amount)+'</td><td>'+esc(isOffer?(x.anonymous?"Anonymous":memberCache.find(m=>m.id===x.member_id)?.full_name||"Not linked"):x.description)+'</td><td>'+esc(x.voided_at?"Voided":"Recorded")+'</td><td>'+(x.voided_at?"":'<button class="ghost" data-void="'+esc(x.id)+'">Void</button>')+'</td></tr>'));$("#financeTable").querySelectorAll("[data-void]").forEach(btn=>btn.onclick=async()=>{const reason=prompt("Reason for voiding this entry (cannot be undone):");if(!reason?.trim())return;const {error}=await db.from(kind).update({voided_at:new Date().toISOString(),void_reason:reason.trim()}).eq("id",btn.dataset.void);if(error)notice(error.message);else{notice("Entry voided, retained in audit records.",true);await render()}})};
 $("#financeMonth").onchange=draw;$("#allFinance").onclick=()=>{$("#financeMonth").value="";draw()};draw();
 $("#newFinance").onclick=()=>{const fields=isOffer?[
 {key:"entry_date",label:"Date",type:"date",value:today(),required:true},{key:"category",label:"Category",type:"select",options:["Tithes","General Offering","Missions","Building Fund","Special Offering","Other"].map(s=>'<option>'+s+"</option>").join("")},{key:"amount",label:"Amount (PHP)",type:"number",required:true},{key:"member_id",label:"Donor (optional)",type:"select",options:'<option value="">Unlinked / anonymous</option>'+opts(memberCache)},{key:"anonymous",label:"Anonymous donation",type:"select",options:'<option value="false">No</option><option value="true">Yes</option>'},{key:"payment_method",label:"Method",type:"select",options:'<option>Cash</option><option>Bank Transfer</option><option>GCash</option><option>Other</option>'},{key:"reference_no",label:"Receipt / Reference"},{key:"note",label:"Notes",type:"textarea"}
 ]:[{key:"entry_date",label:"Date",type:"date",value:today(),required:true},{key:"category",label:"Expense category",required:true},{key:"amount",label:"Amount (PHP)",type:"number",required:true},{key:"description",label:"Description",required:true},{key:"payee",label:"Payee"},{key:"fund",label:"Fund used",type:"select",options:["General Offering","Tithes","Missions","Building Fund","Special Offering","Other"].map(s=>'<option>'+s+"</option>").join("")},{key:"reference_no",label:"Voucher / Reference"}];
 formModal(isOffer?"Record an offering":"Record an expense",fields,async o=>{o.amount=Number(o.amount);if(!(o.amount>0))throw Error("Amount must be above zero");if(isOffer){o.anonymous=o.anonymous==="true";if(o.anonymous)o.member_id=null;}await save(kind,o)})};
}
async function reports(){const [o,e]=await Promise.all([query("offerings","*","entry_date"),query("expenses","*","entry_date")]);$("#view").innerHTML='<section class="panel"><div class="sectionhead"><h1>Financial Reports</h1><button id="exportCsv">Export CSV</button></div><label>Reporting month<input type="month" id="reportMonth" value="'+today().slice(0,7)+'"></label><div id="reportBody"></div><p class="hint">Only active (non-voided) entries are included in totals. Exports contain category-level aggregates, not donor identities.</p></section>';
 const report=()=>{const m=$("#reportMonth").value;const donations=o.filter(x=>!x.voided_at&&(!m||x.entry_date.startsWith(m))),costs=e.filter(x=>!x.voided_at&&(!m||x.entry_date.startsWith(m)));const sum=x=>x.reduce((a,b)=>a+Number(b.amount),0);const grouped={};for(const x of donations)grouped["Offering: "+x.category]=(grouped["Offering: "+x.category]||0)+Number(x.amount);for(const x of costs)grouped["Expense: "+x.category]=(grouped["Expense: "+x.category]||0)+Number(x.amount);const a=sum(donations),b=sum(costs);$("#reportBody").innerHTML='<div class="stats"><div class="stat"><small>Received</small><strong>'+money(a)+'</strong></div><div class="stat"><small>Spent</small><strong>'+money(b)+'</strong></div><div class="stat"><small>Net balance</small><strong>'+money(a-b)+'</strong></div></div><h2 style="margin-top:24px">Breakdown by category</h2>'+table(["Category","Amount"],Object.entries(grouped).map(([c,v])=>'<tr><td>'+esc(c)+'</td><td>'+money(v)+'</td></tr>'));return grouped};
 $("#reportMonth").onchange=report;$("#exportCsv").onclick=()=>{const grouped=report(),rows=[["Category","Amount PHP"],...Object.entries(grouped)],csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="faith-assembly-report-"+($("#reportMonth").value||"all")+".csv";a.click();URL.revokeObjectURL(url)};report()
}
start().catch(e=>notice(e.message));
async function adminAccountsApi(payload){
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session)throw Error("Please sign in as administrator.");
 const response=await fetch(conf.supabaseUrl+"/functions/v1/church-admin-users",{
  method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"apikey":conf.supabaseAnonKey,"Content-Type":"application/json"},
  body:JSON.stringify(payload)
 });
 const result=await response.json().catch(()=>({error:"Unable to read account service response"}));
 if(!response.ok)throw Error(result.error||"Account management failed");
 return result;
}
async function accounts(){
 const [seats,server]=await Promise.all([query("church_role_seats","*","seat_id"),adminAccountsApi({action:"list"})]);
 const assigned=server.accounts||[];
 const count=roleName=>assigned.filter(x=>x.role===roleName).length;
 const limits={pastor:1,board:8,treasurer:2};
 const options=['pastor','board','treasurer','secretary','attendance'];
 $("#view").innerHTML='<section class="panel"><div class="sectionhead"><h1>Manage User Accounts</h1><button id="inviteStaff">+ Create User</button></div><p>Create an account immediately using a staff email. The system generates a strong temporary password, shown once to the administrator. Share it privately and ask the user to change it after first sign-in.</p><div class="stats">'+[['Pastor',count('pastor'),1],['Board Members',count('board'),8],['Treasurers',count('treasurer'),2]].map(([name,n,max])=>'<div class="stat"><small>'+name+'</small><strong>'+n+' / '+max+'</strong></div>').join("")+'</div><h2 style="margin-top:24px">Registered Users</h2>'+table(["Email","Current role","Change role"],assigned.map(a=>'<tr><td>'+esc(a.email)+'</td><td>'+esc(a.role)+'</td><td>'+(a.role==='admin'?'<span class="badge">Protected administrator</span>':'<button class="ghost" data-user="'+esc(a.user_id)+'">Edit role</button>')+'</td></tr>'))+'<h2 style="margin-top:24px">Leadership allocation</h2>'+table(["Seat","Status"],seats.map(s=>'<tr><td>'+esc(s.label)+'</td><td>'+esc(count(s.role)?count(s.role)+" "+s.role+" account(s) registered":"Available")+'</td></tr>'))+'<p class="hint">Limits: 1 pastor, 8 board members, 2 treasurers. No email activation is required for new accounts. Existing accounts keep their own credentials.</p></section>';
 $("#inviteStaff").onclick=()=>formModal("Create a church user",[
 {key:"email",label:"Personal email",type:"email",required:true},
 {key:"role",label:"Access role",type:"select",options:options.map(x=>'<option value="'+x+'">'+x.charAt(0).toUpperCase()+x.slice(1)+'</option>').join("")}
 ],async payload=>{const created=await adminAccountsApi({action:"create_user",email:payload.email,role:payload.role});await accounts();const d=document.createElement("dialog");d.innerHTML="<h2>Account created</h2><p>The new account is ready to sign in without email activation. Copy the temporary password now. It will not be shown again.</p><p><strong>Email:</strong> "+esc(created.email)+"</p><p><strong>Temporary password:</strong> <code id=\"newTemporaryPassword\"></code></p><button id=\"copyTemporaryPassword\" type=\"button\">Copy credentials</button> <button id=\"closeCreated\" type=\"button\" class=\"ghost\">Close</button>";document.body.append(d);d.querySelector("#newTemporaryPassword").textContent=created.temporaryPassword;d.querySelector("#copyTemporaryPassword").onclick=()=>{navigator.clipboard.writeText("Email: "+created.email+"\\nTemporary password: "+created.temporaryPassword).then(()=>notice("Credentials copied. Share privately.",true)).catch(()=>notice("Clipboard unavailable. Copy the password manually."))};d.querySelector("#closeCreated").onclick=()=>{d.close();d.remove()};d.showModal();notice("New staff account created.",true)});
 $("#view").querySelectorAll("[data-user]").forEach(b=>b.onclick=()=>{
  const current=assigned.find(a=>a.user_id===b.dataset.user);
  if(!current)return;
  formModal("Change user role",[{key:"role",label:"New role",type:"select",options:options.map(x=>'<option value="'+x+'" '+(current.role===x?'selected':'')+'>'+x+'</option>').join("")}],async form=>{
   await adminAccountsApi({action:"change_role",user_id:current.user_id,role:form.role});
   notice("User role updated.",true);await accounts()
  });
 });
}
