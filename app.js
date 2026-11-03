import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const conf=window.CHURCH_CONFIG||{};
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n)||0);
const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const notice=(msg,ok=false)=>{const n=$("#message");n.textContent=msg;n.className="message"+(ok?" ok":"")};
const configured=Boolean(conf.supabaseUrl&&conf.supabaseAnonKey);
const db=configured?createClient(conf.supabaseUrl,conf.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let role=null,memberCache=[],eventCache=[],activeTab=location.hash==="#attendance"?"attendance":location.hash==="#sunday_absences"?"sunday_absences":"dashboard";
const authRoles={dashboard:["admin","pastor","board","secretary","attendance","treasurer"],members:["admin","pastor","board","secretary","attendance","treasurer"],attendance:["admin","pastor","secretary","attendance"],sunday_absences:["admin","pastor","secretary","attendance"],offerings:["admin","treasurer"],expenses:["admin","treasurer"],reports:["admin","treasurer"],birthdays:["admin","pastor","board","secretary","attendance","treasurer"],accounts:["admin"]};
const can=t=>Boolean(role&&authRoles[t]?.includes(role));
const writableMembers=()=>["admin","secretary"].includes(role);
const canAttend=()=>["admin","secretary","attendance"].includes(role);
function opts(list,key="id",label="full_name"){return list.map(v=>'<option value="'+esc(v[key])+'">'+esc(v[label])+"</option>").join("")}
function table(head,rows){return '<div class="tablewrap"><table><thead><tr>'+head.map(h=>"<th>"+esc(h)+"</th>").join("")+'</tr></thead><tbody>'+(rows.length?rows.join(""):'<tr><td colspan="'+head.length+'" class="empty">No records yet</td></tr>')+'</tbody></table></div>'}
async function query(tableName,sel="*",order="created_at"){const {data,error}=await db.from(tableName).select(sel).order(order,{ascending:false}).limit(1000);if(error)throw error;return data||[]}
async function save(tableName,obj){const {error}=await db.from(tableName).insert(obj);if(error)throw error;notice("Record saved successfully.",true);await render()}

function birthdayItems(members,range=30){
 const localDate=today(),start=new Date(localDate+"T12:00:00Z"),year=start.getUTCFullYear();
 const isLeap=y=>y%4===0&&(y%100!==0||y%400===0);
 const items=[];
 for(const m of members){
  if(m.status!=="active"||!m.birthday)continue;
  const parts=String(m.birthday).split("-").map(Number);
  if(parts.length!==3||!parts[1]||!parts[2])continue;
  let best=null;
  for(const y of [year,year+1]){
   const month=parts[1],day=month===2&&parts[2]===29&&!isLeap(y)?28:parts[2];
   const d=new Date(Date.UTC(y,month-1,day,12));
   const days=Math.round((d.getTime()-start.getTime())/86400000);
   if(days>=0&&(best===null||days<best.days))best={days,date:d};
  }
  if(best&&best.days<=range)items.push({name:m.full_name,memberId:m.id,days:best.days,date:best.date,month:parts[1],day:parts[2]});
 }
 return items.sort((a,b)=>a.days-b.days||a.name.localeCompare(b.name));
}
function birthdayLabel(days){return days===0?"Today":days===1?"Tomorrow":"In "+days+" days"}

/* Assess only the three immediately preceding, completed calendar Sundays.
   Each Sunday needs an actual Sunday service AND at least one recorded check-in,
   otherwise the result is incomplete rather than an absence allegation. */
function previousThreeSundays(){
 const ph=today(),current=new Date(ph+"T12:00:00Z"),weekday=current.getUTCDay();
 const daysToPrevious=weekday===0?7:weekday;
 return [0,1,2].map(i=>new Date(current.getTime()-(daysToPrevious+i*7)*86400000).toISOString().slice(0,10)).reverse();
}
async function getSundayAbsenceData(members,events){
 const sundays=previousThreeSundays();
 const sundayEvents=events.filter(e=>sundays.includes(e.event_date)&&new Date(e.event_date+"T12:00:00Z").getUTCDay()===0&&(/sunday/i.test(e.event_type||"")||/sunday/i.test(e.title||"")));
 const byDate=new Map(sundays.map(day=>[day,sundayEvents.filter(e=>e.event_date===day)]));
 const ids=sundayEvents.map(e=>e.id);
 let checkins=[];
 if(ids.length){
  const {data,error}=await db.from("attendance").select("event_id,member_id").in("event_id",ids).limit(10000);
  if(error)throw error;
  checkins=data||[];
  if(checkins.length===10000)throw Error("Attendance data limit reached. Cannot safely calculate Sunday absences.");
 }
 const recorded=new Map(sundays.map(day=>[day,new Set(checkins.filter(a=>byDate.get(day).some(e=>e.id===a.event_id)).map(a=>a.member_id))]));
 const ready=sundays.every(d=>byDate.get(d).length>0&&recorded.get(d).size>0);
 const missing=sundays.filter(d=>byDate.get(d).length===0||recorded.get(d).size===0)
  .map(d=>({date:d,reason:byDate.get(d).length===0?"No Sunday service recorded":"No attendance check-ins recorded"}));
 const flagged=ready?members.filter(m=>m.status==="active"&&m.member_since<=sundays[0]&&sundays.every(day=>!recorded.get(day).has(m.id))).sort((a,b)=>a.full_name.localeCompare(b.full_name)):[];
 return {sundays,ready,missing,flagged,eventsBySunday:byDate,recorded};
}
function readableSunday(date){
 return new Date(date+"T12:00:00Z").toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
}
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
function nav(){const list=[["dashboard","Overview"],["members","Members"],["attendance","Attendance & Events"],["sunday_absences","Sunday Absence Alerts"],["offerings","Tithes & Offerings"],["expenses","Expenses"],["reports","Reports"],["birthdays","🎂 Birthdays"],["accounts","Accounts"]];
 $("#tabs").innerHTML=list.filter(([key])=>can(key)).map(([key,label])=>'<button data-tab="'+key+'" class="'+(activeTab===key?"active":"")+'">'+label+"</button>").join("");
 $("#tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;nav();render()});
}
async function render(){try{if(!can(activeTab))activeTab="dashboard";const v=$("#view");v.innerHTML='<section class="panel">Loading records…</section>';if(activeTab==="dashboard")await dashboard();else if(activeTab==="members")await members();else if(activeTab==="attendance")await attendance();else if(activeTab==="sunday_absences")await sundayAbsences();else if(activeTab==="offerings")await finance("offerings");else if(activeTab==="expenses")await finance("expenses");else if(activeTab==="accounts")await accounts();else if(activeTab==="birthdays")await birthdays();else await reports()}catch(e){$("#view").innerHTML='<section class="panel"><h2>Unable to load section</h2><p>'+esc(e.message)+'</p></section>';notice(e.message)}}
async function dashboard(){
 await loadMembers();
 const events=await query("church_events","*","event_date");
 const att=role==="board"?[]:await query("attendance","*","checked_in_at");
 let offerings=[],expenses=[];
 if(can("reports")){offerings=await query("offerings");expenses=await query("expenses")}
 const total=items=>items.filter(x=>!x.voided_at).reduce((sum,x)=>sum+Number(x.amount),0);
 const active=memberCache.filter(x=>x.status==="active").length;
 const newMembers=memberCache.filter(x=>(x.member_since||"").startsWith(today().slice(0,7))).length;
 const recentEvents=events.slice().sort((a,b)=>b.event_date.localeCompare(a.event_date)).slice(0,5);
 const upcomingBirthdays=birthdayItems(memberCache,7);
 const birthdayToday=upcomingBirthdays.filter(x=>x.days===0);

 const sundayAlerts=can("sunday_absences")?await getSundayAbsenceData(memberCache,events):null;
 const sundayCard=sundayAlerts?'<section class="dash-sunday-alert"><div class="dash-section-heading"><div><span class="dash-eyebrow">MEMBER CARE</span><h2>Sunday Absence Alerts</h2></div><button class="ghost" id="dashSundayAlerts">View alerts →</button></div>'+
 (sundayAlerts.ready?(sundayAlerts.flagged.length?'<p class="sa-status-warning">⚠️ '+sundayAlerts.flagged.length+' member'+(sundayAlerts.flagged.length===1?' has':'s have')+' missed 3 consecutive Sundays.</p>':'<p class="sa-ok">✓ No three-Sunday absences detected.</p>'):
 '<p class="sa-not-ready">Sunday attendance records are incomplete. '+sundayAlerts.missing.length+' Sunday'+(sundayAlerts.missing.length===1?' needs':'s need')+' attendance verification.</p>')+'</section>':"";
 const birthdayCard='<section class="dash-birthdays"><div class="dash-section-heading"><div><span class="dash-eyebrow">CELEBRATE OUR CHURCH FAMILY</span><h2>🎂 Birthdays & Celebrations</h2></div><button class="ghost" id="dashAllBirthdays">View all birthdays →</button></div>'+
 (upcomingBirthdays.length?'<div class="birthday-highlight">'+(birthdayToday.length?'<p class="birthday-today-banner">🎉 '+birthdayToday.length+' birthday'+(birthdayToday.length===1?"":"s")+' today!</p>':"")+
 upcomingBirthdays.map(b=>'<div class="birthday-dash-item"><span class="birthday-date"><strong>'+b.date.toLocaleDateString("en-PH",{month:"short",timeZone:"UTC"})+'</strong><small>'+b.date.getUTCDate()+'</small></span><div><strong>'+esc(b.name)+'</strong><small>'+birthdayLabel(b.days)+'</small></div><span class="birthday-balloon" aria-hidden="true">🎂</span></div>').join("")+'</div>':
 '<p class="birthday-none">No recorded birthdays in the next 7 days. Add members’ birthdays in the Member Directory.</p>')+'</section>';

 const statItems=[
  {label:"Active Members",value:active,icon:"♧",tone:"sage",detail:"Our growing church family"},
  {label:"New This Month",value:newMembers,icon:"✦",tone:"peach",detail:"Newly welcomed members"},
  {label:role==="board"?"Church Ministries":"Total Check-ins",value:role==="board"?new Set(memberCache.map(m=>m.ministry).filter(Boolean)).size:att.length,icon:"◷",tone:"lavender",detail:role==="board"?"Active ministry groups":"Attendance records"},
  {label:"Church Services",value:events.length,icon:"✝",tone:"butter",detail:"Services and gatherings"}
 ];
 const statHTML=statItems.map((s,i)=>'<article class="dash-stat '+s.tone+'"><div class="dash-stat-top"><span>'+esc(s.label)+'</span><span class="dash-stat-icon" aria-hidden="true">'+s.icon+'</span></div><strong>'+esc(s.value)+'</strong><small>'+esc(s.detail)+'</small><span class="dash-stat-number">0'+(i+1)+'</span></article>').join("");
 const financial=can("reports")?'<section class="dash-finance"><div class="dash-section-heading"><div><span class="dash-eyebrow">FINANCIAL STEWARDSHIP</span><h2>Giving & Expenses</h2></div><button class="ghost" id="dashReports">View reports →</button></div><div class="dash-finance-grid"><div><small>Total Giving</small><strong>'+money(total(offerings))+'</strong><span>Recorded offerings</span></div><div><small>Total Expenses</small><strong>'+money(total(expenses))+'</strong><span>Recorded expenditures</span></div><div class="balance"><small>Available Balance</small><strong>'+money(total(offerings)-total(expenses))+'</strong><span>Giving less expenses</span></div></div></section>':"";
 const eventHTML=recentEvents.length?recentEvents.map(e=>'<div class="dash-event"><span class="dash-date"><strong>'+esc(e.event_date.slice(8,10))+'</strong><small>'+esc(new Date(e.event_date+"T12:00:00").toLocaleString("en-PH",{month:"short"}))+'</small></span><span class="dash-event-info"><strong>'+esc(e.title)+'</strong><small>'+esc(e.event_type)+'</small></span><span class="dash-event-dot">✦</span></div>').join(""):'<div class="dash-empty">No events recorded yet. Add your next Sunday service in Attendance.</div>';
 $("#view").innerHTML='<div class="church-dashboard"><section class="dash-hero"><div class="dash-hero-copy"><span class="dash-kicker">✦ FAITH ASSEMBLY OF GOD • CHURCH PORTAL</span><h1>Growing together <em>in faith.</em></h1><p>Welcome back. Here is a beautiful overview of your church community, gatherings, and stewardship.</p><span class="dash-date-label">'+esc(new Date().toLocaleDateString("en-PH",{timeZone:"Asia/Manila",weekday:"long",month:"long",day:"numeric",year:"numeric"}))+'</span>'+(can("attendance")?'<button class="dash-attendance-shortcut" id="dashQuickAttendance" type="button">✓ Take Attendance</button>':"")+'</div><div class="dash-hero-art" aria-hidden="true"><div class="dash-halo halo-one"></div><div class="dash-halo halo-two"></div><img class="dash-logo" src="assets/faog-logo.webp" alt="Faith Assembly of God official logo"><div class="dash-spark one">✦</div><div class="dash-spark two">✧</div></div></section><div class="dash-title-row"><div><span class="dash-eyebrow">AT A GLANCE</span><h2>Our Church Community</h2></div><span class="dash-live"><span></span>Live data</span></div><section class="dash-stat-grid">'+statHTML+'</section>'+sundayCard+birthdayCard+'<div class="dash-lower"><section class="dash-events"><div class="dash-section-heading"><div><span class="dash-eyebrow">WORSHIP & FELLOWSHIP</span><h2>Recent Gatherings</h2></div></div>'+eventHTML+'</section><aside class="dash-verse"><span class="dash-eyebrow">VERSE OF ENCOURAGEMENT</span><span class="dash-quote-mark">“</span><blockquote>Let all that you do be done in love.</blockquote><span class="dash-scripture">1 Corinthians 16:14</span><div class="dash-verse-decor">✝</div></aside></div>'+financial+'<p class="dash-footnote">Faith Assembly of God · Serving the community with faith, care, and integrity</p></div>';
 const reportBtn=$("#dashReports");if(reportBtn)reportBtn.onclick=()=>{activeTab="reports";nav();render()};
 const checkinBtn=$("#dashQuickAttendance");if(checkinBtn)checkinBtn.onclick=()=>{activeTab="attendance";location.hash="attendance";nav();render()};
 const birthdayBtn=$("#dashAllBirthdays");if(birthdayBtn)birthdayBtn.onclick=()=>{activeTab="birthdays";location.hash="birthdays";nav();render()};
 const absenceBtn=$("#dashSundayAlerts");if(absenceBtn)absenceBtn.onclick=()=>{activeTab="sunday_absences";location.hash="sunday_absences";nav();render()};


}

async function sundayAbsences(){
 await Promise.all([loadMembers(),loadEvents()]);
 const result=await getSundayAbsenceData(memberCache,eventCache);
 const v=$("#view");
 const dateList=result.sundays.map(d=>'<span class="sa-date">'+readableSunday(d)+'</span>').join("");
 const alertRows=result.flagged.map(m=>'<article class="sa-member"><div class="sa-avatar">'+esc(m.full_name.trim().split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase())+'</div><div class="sa-member-details"><strong>'+esc(m.full_name)+'</strong><span>Not checked in on all 3 Sunday services</span><small>Member since '+esc(m.member_since)+(m.ministry?' • '+esc(m.ministry):'')+'</small></div>'+(m.phone?'<a class="sa-phone" href="tel:'+esc(m.phone.replace(/[^+\d]/g,""))+'">Call member</a>':"")+'</article>').join("");
 const output=result.ready?(result.flagged.length?
  '<p class="sa-status-warning">⚠️ '+result.flagged.length+' active member'+(result.flagged.length===1?' needs':'s need')+' a friendly follow-up.</p><div class="sa-list">'+alertRows+'</div>':
  '<div class="sa-ok">✓ No members were flagged for missing all three recorded Sundays.</div>'):
  '<div class="sa-not-ready"><strong>Attendance records are incomplete.</strong><p>No absence alerts will be shown until attendance is recorded for all three consecutive Sundays.</p>'+
  result.missing.map(x=>'<div class="sa-missing"><strong>'+readableSunday(x.date)+'</strong><span>'+esc(x.reason)+'</span></div>').join("")+'</div>';
 v.innerHTML='<section class="sa-page"><div class="sa-header"><div><span class="attendance-kicker">PASTORAL CARE & FOLLOW-UP</span><h1>Sunday Absence Alerts</h1><p>Automatically checks the last three completed Sundays — not Wednesdays or other weekdays.</p></div><div class="sa-count"><strong>'+(result.ready?result.flagged.length:'—')+'</strong><span>Members flagged</span></div></div>'+
 '<section class="sa-card"><div class="sa-heading"><div><h2>Three Sundays being checked</h2><p>Each Sunday must have a service and recorded attendance.</p></div><button class="ghost" id="saRefresh">↻ Refresh</button></div><div class="sa-dates">'+dateList+'</div>'+output+'</section>'+
 '<p class="sa-footnote">For church staff only. These are attendance-based follow-up suggestions, not proof of a member’s absence from all church activities. New members who joined after the first checked Sunday are excluded.</p></section>';
 $("#saRefresh").onclick=()=>sundayAbsences();
}
async function birthdays(){
 await loadMembers();
 const all=birthdayItems(memberCache,366);
 const upcoming=all.filter(b=>b.days<=30);
 const todayList=all.filter(b=>b.days===0);
 const v=$("#view");
 v.innerHTML='<section class="birthdays-page"><div class="birthdays-hero"><div><span class="attendance-kicker">FAITH ASSEMBLY OF GOD</span><h1>🎂 Birthday Celebrations</h1><p>Stay connected with your church family. Birthdays are displayed automatically from member records.</p></div><div class="birthdays-today-count"><strong>'+todayList.length+'</strong><span>Celebrating today</span></div></div>'+
 '<div class="birthday-sections"><section><h2>Upcoming 30 Days</h2><div class="birthday-roster">'+
 (upcoming.length?upcoming.map(b=>'<article class="birthday-entry"><span class="birthday-date"><strong>'+b.date.toLocaleDateString("en-PH",{month:"short",timeZone:"UTC"})+'</strong><small>'+b.date.getUTCDate()+'</small></span><div><strong>'+esc(b.name)+'</strong><small>'+birthdayLabel(b.days)+'</small></div><span>🎉</span></article>').join(""):'<p class="birthday-none">No birthdays coming up in the next 30 days.</p>')+
 '</div></section><section><h2>All Recorded Birthdays</h2><label for="birthdaySearch">Search members<input id="birthdaySearch" type="search" placeholder="Search member name…" autocomplete="off"></label><div class="birthday-roster" id="birthdayAll"></div></section></div></section>';
 const draw=()=>{const q=$("#birthdaySearch").value.toLowerCase().trim();
 const matches=all.filter(b=>b.name.toLowerCase().includes(q));
 $("#birthdayAll").innerHTML=matches.map(b=>'<div class="birthday-entry"><span class="birthday-date"><strong>'+b.date.toLocaleDateString("en-PH",{month:"short",timeZone:"UTC"})+'</strong><small>'+b.date.getUTCDate()+'</small></span><div><strong>'+esc(b.name)+'</strong><small>'+birthdayLabel(b.days)+'</small></div></div>').join("")||'<p class="birthday-none">No matching birthday records.</p>'};
 $("#birthdaySearch").oninput=draw;draw();
}
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
async function attendance(){
 await Promise.all([loadMembers(),loadEvents()]);
 const writable=canAttend();
 const allMembers=memberCache.filter(m=>m.status==="active").sort((a,b)=>a.full_name.localeCompare(b.full_name));
 const events=eventCache.slice().sort((a,b)=>b.event_date.localeCompare(a.event_date)||a.title.localeCompare(b.title));
 const savedEventId=sessionStorage.getItem("faog_attendance_event");
 let chosenEvent=events.find(e=>e.id===savedEventId)?.id||events.find(e=>e.event_date===today())?.id||events[0]?.id||"";
 let checked=new Map(),search="",filter="all",eventSearch="",loading=false;
 const v=$("#view");
 v.innerHTML='<div class="easy-attendance">'+
  '<div class="ea-head"><div><span class="attendance-kicker">CHURCH SERVICES & ACTIVITIES</span><h1>Attendance & Events</h1><p>Choose any event below, then tap <strong>Check in</strong> beside a member.</p></div>'+
  (writable?'<button id="eaCreate" class="attendance-new">+ Create Event</button>':"")+'</div>'+
  '<div class="ea-event-header"><div><h2>All Church Events <span id="eaEventTotal" class="ea-total"></span></h2><p>Every recorded service and event appears here.</p></div><label for="eaEventSearch">Search events<input id="eaEventSearch" type="search" placeholder="Event name or date…"></label></div>'+
  '<div id="eaEvents" class="ea-events"></div>'+
  '<section class="ea-roster" id="eaRoster"><div class="ea-roster-head"><div><span class="attendance-kicker">FAST ATTENDANCE</span><h2 id="eaSelectedTitle">Select an event</h2><p id="eaSelectedDate"></p></div><div class="ea-counts"><div><strong id="eaPresent">0</strong><span>Present</span></div><div><strong id="eaNotPresent">0</strong><span>Not checked in</span></div><div><strong id="eaMemberTotal">0</strong><span>Total active</span></div></div></div>'+
  '<div class="ea-search-row"><label for="eaMemberSearch">Find a member<input id="eaMemberSearch" type="search" placeholder="Search member name or ministry…" autocomplete="off"></label><div class="ea-filter-group"><button type="button" data-ea-filter="all" class="active">All Members</button><button type="button" data-ea-filter="absent">Not Checked In</button><button type="button" data-ea-filter="present">Present</button></div></div>'+
  '<div id="eaBusy" role="status" aria-live="polite"></div><p class="ea-list-count" id="eaShown"></p><div id="eaMembers" class="ea-members"></div></section></div>';
 const $v=selector=>v.querySelector(selector);
 let counts=new Map();
 // Load per-event attendance totals for the event cards without exposing member names.
 const {data:summary,error:summaryError}=await db.from("attendance").select("event_id").limit(10000);
 if(!summaryError)for(const record of summary||[])counts.set(record.event_id,(counts.get(record.event_id)||0)+1);
 else notice("Event counts could not be loaded: "+summaryError.message);
 function drawEvents(){
  $v("#eaEventTotal").textContent="("+events.length+")";
  const shown=events.filter(e=>(e.title+" "+e.event_type+" "+e.event_date).toLowerCase().includes(eventSearch));
  $v("#eaEvents").innerHTML=shown.map(e=>{
   const active=e.id===chosenEvent;
   const date=new Date(e.event_date+"T12:00:00");
   const formatted=date.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
   return '<article class="ea-event'+(active?" selected":"")+'"><div class="ea-event-icon" aria-hidden="true">✝</div><div class="ea-event-detail"><span class="ea-event-type">'+esc(e.event_type||"Church event")+'</span><h3>'+esc(e.title)+'</h3><p>📅 '+esc(formatted)+'</p><span class="ea-event-count">'+(counts.get(e.id)||0)+' checked in</span></div><button type="button" data-ea-event="'+esc(e.id)+'" class="ea-open">'+(active?"✓ Selected":"Take Attendance →")+'</button></article>';
  }).join("")||'<div class="ea-noevents">No matching events. '+(writable?"Select <strong>+ Create Event</strong> to add one.":"Ask the administrator to add an event.")+'</div>';
  $v("#eaEvents").querySelectorAll("[data-ea-event]").forEach(btn=>btn.onclick=()=>selectEvent(btn.dataset.eaEvent));
 }
 function updateCounts(){
  const present=allMembers.filter(m=>checked.has(m.id)).length;
  $v("#eaPresent").textContent=String(present);
  $v("#eaNotPresent").textContent=String(allMembers.length-present);
  $v("#eaMemberTotal").textContent=String(allMembers.length);
  if(chosenEvent)counts.set(chosenEvent,checked.size);
 }
 function drawMembers(){
  updateCounts();
  const shown=allMembers.filter(m=>(m.full_name+" "+(m.ministry||"")).toLowerCase().includes(search)&&(filter==="all"||(filter==="present"?checked.has(m.id):!checked.has(m.id))));
  $v("#eaShown").textContent=shown.length+" member"+(shown.length===1?"":"s")+" shown";
  $v("#eaMembers").innerHTML=shown.map(m=>{
   const present=checked.has(m.id);
   const initials=m.full_name.trim().split(/\s+/).slice(0,2).map(p=>p.charAt(0)).join("").toUpperCase();
   return '<div class="ea-person'+(present?" is-present":"")+'"><span class="ea-avatar">'+esc(initials)+'</span><div class="ea-person-details"><strong>'+esc(m.full_name)+'</strong><small>'+esc(m.ministry||"Church member")+'</small></div><span class="ea-person-state">'+(present?"✓ Present":"Not checked in")+'</span>'+(writable?'<button type="button" data-ea-member="'+esc(m.id)+'" class="'+(present?"ea-undo":"ea-check")+'">'+(present?"Undo":"✓ Check in")+'</button>':"")+'</div>';
  }).join("")||'<div class="ea-noevents">No matching members found.</div>';
  $v("#eaMembers").querySelectorAll("[data-ea-member]").forEach(button=>button.onclick=()=>toggleMember(button.dataset.eaMember));
 }
 function busy(value,message=""){
  loading=value;$v("#eaBusy").textContent=message;
  $v("#eaEvents").querySelectorAll("button").forEach(b=>b.disabled=value);
  $v("#eaMembers").querySelectorAll("button").forEach(b=>b.disabled=value);
 }
 async function selectEvent(id){
  const event=events.find(e=>e.id===id);if(!event||loading)return;
  chosenEvent=id;sessionStorage.setItem("faog_attendance_event",id);
  $v("#eaRoster").hidden=false;
  $v("#eaSelectedTitle").textContent=event.title;
  $v("#eaSelectedDate").textContent=event.event_date+" • "+(event.event_type||"Church event");
  drawEvents();busy(true,"Loading event attendance…");
  const {data,error}=await db.from("attendance").select("id,member_id").eq("event_id",id).limit(10000);
  if(error){busy(false,"Unable to load attendance.");notice(error.message);return}
  checked=new Map((data||[]).map(x=>[x.member_id,x.id]));
  counts.set(id,checked.size);
  busy(false);drawEvents();drawMembers();
 }
 async function toggleMember(id){
  if(!writable||loading||!chosenEvent)return;
  const member=allMembers.find(m=>m.id===id);if(!member)return;
  const existing=checked.get(id);busy(true,existing?"Removing attendance…":"Saving attendance…");
  try{
   if(existing){
    const {error}=await db.from("attendance").delete().eq("id",existing);if(error)throw error;
    checked.delete(id);notice(member.full_name+" — removed from attendance.",true);
   }else{
    const {data,error}=await db.from("attendance").insert({event_id:chosenEvent,member_id:id}).select("id").single();
    if(error){if(error.code==="23505"){notice("Already checked in; refreshing.",true);await selectEventAfterBusy();return}throw error}
    checked.set(id,data.id);notice(member.full_name+" — marked present!",true);
   }
  }catch(e){notice(e.message)}finally{busy(false);drawMembers();drawEvents()}
 }
 async function selectEventAfterBusy(){const {data,error}=await db.from("attendance").select("id,member_id").eq("event_id",chosenEvent).limit(10000);if(!error)checked=new Map((data||[]).map(x=>[x.member_id,x.id]))}
 $v("#eaEventSearch").oninput=e=>{eventSearch=e.target.value.toLowerCase().trim();drawEvents()};
 $v("#eaMemberSearch").oninput=e=>{search=e.target.value.toLowerCase().trim();drawMembers()};
 $v("#eaRoster").querySelectorAll("[data-ea-filter]").forEach(button=>button.onclick=()=>{filter=button.dataset.eaFilter;$v("#eaRoster").querySelectorAll("[data-ea-filter]").forEach(x=>x.classList.toggle("active",x===button));drawMembers()});
 if(writable)$v("#eaCreate").onclick=()=>formModal("Create church event",[
  {key:"title",label:"Event title",value:"Sunday Worship Service",required:true},
  {key:"event_date",label:"Event date",type:"date",value:today(),required:true},
  {key:"event_type",label:"Event type",type:"select",options:"<option>Sunday Service</option><option>Midweek Service</option><option>Prayer Meeting</option><option>Special Event</option><option>Other</option>"}
 ],async form=>{
  const {data,error}=await db.from("church_events").insert(form).select("id").single();if(error)throw error;
  sessionStorage.setItem("faog_attendance_event",data.id);
  notice("Event created! You can now take attendance.",true);
  await attendance();
 });
 drawEvents();
 if(chosenEvent)await selectEvent(chosenEvent);
 else {$v("#eaRoster").hidden=true;$v("#eaEvents").innerHTML='<div class="ea-noevents">No church events yet. '+(writable?'Click <strong>+ Create Event</strong> above to start.':'Ask an administrator to create an event.')+'</div>'}
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
