import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AlertTriangle, ArrowDownToLine, ArrowLeft, Check, ClipboardList, FileText, LogOut, Mail, MapPin, Menu, PackagePlus, Pencil, Plus, Printer, Search, Send, Ship, Trash2, X } from "lucide-react";
import { getSupabaseConfigMessage, supabase, supabaseConfigured } from "@/lib/supabase";
import { sendSavedEmailDraft } from "@/lib/edge-functions";
import { supabaseRepository, type EmailDraft, type Shipment, type ShipmentStatus, type TrackingUpdate } from "./repository";
import PrintInvoiceModal from "./PrintInvoiceModal";
import TrackingUpdatesModal from "./TrackingUpdatesModal";

type View = "overview" | "shipments" | "emails";
const statuses:ShipmentStatus[]=["Booked","Picked up","In transit","Stopover","Held by Customs","Out for delivery","Delayed","Delivered","Exception","Failed delivery"];
const emptyShipment:Omit<Shipment,"id"|"tracking"|"created">={status:"Booked",mode:"Air",carrier:"",sender:"",senderEmail:"",senderPhone:"",originStreet:"",originCity:"",originRegion:"",originPostal:"",originCountry:"",recipient:"",recipientEmail:"",recipientPhone:"",destinationStreet:"",destinationCity:"",destinationRegion:"",destinationPostal:"",destinationCountry:"",cargo:"",packages:"1",weight:"",dimensions:"",pickup:"",estimated:"",customFee:"0.00",total:"0.00",paid:"0.00",paymentMethod:"",paymentReference:"",paymentStatus:"Pending",notes:""};
const asMoney=(val:string|number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(val)||0);
const fullOrigin=(s:Shipment)=>[s.originStreet,s.originCity,s.originRegion,s.originPostal,s.originCountry].filter(Boolean).join(", ");
const fullDestination=(s:Shipment)=>[s.destinationStreet,s.destinationCity,s.destinationRegion,s.destinationPostal,s.destinationCountry].filter(Boolean).join(", ");
const niceDate=(d:string)=>d?new Date(`${d}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
const statusClass=(s:string)=>s.toLowerCase().replaceAll(" ","-");

function Field({label,name,value,required=false,type="text",placeholder="",min,step}:{label:string;name:string;value?:string;required?:boolean;type?:string;placeholder?:string;min?:string;step?:string}) {
  return <div className="form-field"><label htmlFor={name}>{label}{required?" *":""}</label><input id={name} name={name} type={type} defaultValue={value} required={required} placeholder={placeholder} min={min} step={step} data-testid={`input-${name}`} /></div>;
}
function AddressFields({prefix,title,data}:{prefix:"origin"|"destination";title:string;data?:Shipment}) {
  const sender=prefix==="origin";
  return <section className="form-section"><h3>{title}</h3><div className="form-grid">
    <Field label={sender?"Sender name":"Recipient name"} name={sender?"sender":"recipient"} value={data?.[sender?"sender":"recipient"]} required />
    <Field label="Email" name={sender?"senderEmail":"recipientEmail"} value={data?.[sender?"senderEmail":"recipientEmail"]} type="email" />
    <Field label="Phone" name={sender?"senderPhone":"recipientPhone"} value={data?.[sender?"senderPhone":"recipientPhone"]} />
    <Field label="Street address" name={sender?"originStreet":"destinationStreet"} value={data?.[sender?"originStreet":"destinationStreet"]} required />
    <Field label="City" name={sender?"originCity":"destinationCity"} value={data?.[sender?"originCity":"destinationCity"]} required />
    <Field label="State / province" name={sender?"originRegion":"destinationRegion"} value={data?.[sender?"originRegion":"destinationRegion"]} />
    <Field label="Postal code" name={sender?"originPostal":"destinationPostal"} value={data?.[sender?"originPostal":"destinationPostal"]} />
    <Field label="Country" name={sender?"originCountry":"destinationCountry"} value={data?.[sender?"originCountry":"destinationCountry"]} required />
  </div></section>;
}

function ShipmentModal({shipment,onClose,onSave}:{shipment?:Shipment;onClose:()=>void;onSave:(s:Shipment)=>void}) {
  const [error,setError]=useState("");
  const [baseCharge,setBaseCharge]=useState(()=>shipment?Math.max(0,Number(shipment.total)-Number(shipment.customFee||0)).toFixed(2):"0.00");
  const [customFee,setCustomFee]=useState(shipment?.customFee||"0.00");
  const calculatedTotal=(Number(baseCharge)||0)+(Number(customFee)||0);
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const fd=new FormData(e.currentTarget); const values=Object.fromEntries(fd.entries()) as Record<string,string>;
    const clean=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.trim()]));
    if(!clean.sender||!clean.recipient||!clean.originCity||!clean.destinationCity){setError("Sender, recipient, and both city fields are required.");return;}
    const baseChargeAmount=Number(clean.baseCharge||0),customFeeAmount=Number(clean.customFee||0),paid=Number(clean.paid||0);
    if(![baseChargeAmount,customFeeAmount,paid].every(Number.isFinite)||baseChargeAmount<0||customFeeAmount<0||paid<0){setError("Charges, custom fee, and amount paid must be valid non-negative amounts.");return;}
    clean.total=(baseChargeAmount+customFeeAmount).toFixed(2);
    clean.customFee=customFeeAmount.toFixed(2);
    delete clean.baseCharge;
    const now=new Date().toISOString().slice(0,10);
    const total=Number(clean.total);
    const record:Shipment={...emptyShipment,...clean,id:shipment?.id||supabaseRepository.makeId(),tracking:shipment?.tracking||"",created:shipment?.created||now,status:clean.status as ShipmentStatus,paymentStatus:(paid>=total&&total>0?"Paid":paid>0?"Partial":clean.paymentStatus||"Pending") as Shipment["paymentStatus"]} as Shipment;
    onSave(record);
  }
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="shipment-modal-title">
    <div className="modal-head"><h2 id="shipment-modal-title">{shipment?"Update shipment":"Create shipment"}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close" data-testid="button-close-shipment"><X/></button></div>
    <form onSubmit={submit}><div className="modal-body">
      {error&&<div className="notice" role="alert"><AlertTriangle/>{error}</div>}
      <section className="form-section"><h3>Shipment details</h3><div className="form-grid">
        <div className="form-field"><label htmlFor="shipment-status">Status</label><select id="shipment-status" name="status" defaultValue={shipment?.status||"Booked"} className="field-control" data-testid="select-shipment-status">{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
        <div className="form-field"><label htmlFor="shipment-mode">Mode</label><select id="shipment-mode" name="mode" defaultValue={shipment?.mode||"Air"} className="field-control" data-testid="select-shipment-mode">{["Air","Road","Sea","Rail"].map(s=><option key={s}>{s}</option>)}</select></div>
        <Field label="Carrier" name="carrier" value={shipment?.carrier} required/>
        <Field label="Cargo description" name="cargo" value={shipment?.cargo} required/>
        <Field label="Package count" name="packages" type="number" value={shipment?.packages||"1"} required/>
        <Field label="Weight" name="weight" value={shipment?.weight} placeholder="e.g. 42 kg"/>
        <Field label="Dimensions" name="dimensions" value={shipment?.dimensions} placeholder="e.g. 60 × 40 × 35 cm"/>
        <Field label="Pickup date" name="pickup" type="date" value={shipment?.pickup}/>
        <Field label="Estimated delivery" name="estimated" type="date" value={shipment?.estimated}/>
      </div></section>
      <AddressFields prefix="origin" title="Sender & full origin" data={shipment}/>
      <AddressFields prefix="destination" title="Recipient & full destination" data={shipment}/>
      <section className="form-section"><h3>Charges & payment</h3><div className="form-grid">
        <div className="form-field"><label htmlFor="shipment-base-charge">Shipping charge (USD) *</label><input id="shipment-base-charge" name="baseCharge" type="number" min="0" step="0.01" value={baseCharge} onChange={e=>setBaseCharge(e.target.value)} required data-testid="input-base-charge"/></div>
        <div className="form-field"><label htmlFor="shipment-custom-fee">Custom fee (USD)</label><input id="shipment-custom-fee" name="customFee" type="number" min="0" step="0.01" value={customFee} onChange={e=>setCustomFee(e.target.value)} data-testid="input-custom-fee"/></div>
        <div className="form-field full charge-total-summary" aria-live="polite"><span>Total charge including custom fee</span><strong>{asMoney(calculatedTotal)}</strong></div>
        <Field label="Amount paid (USD)" name="paid" type="number" min="0" step="0.01" value={shipment?.paid||"0.00"} required/>
        <Field label="Payment method" name="paymentMethod" value={shipment?.paymentMethod}/>
        <Field label="Payment reference" name="paymentReference" value={shipment?.paymentReference}/>
      </div></section>
      <section className="form-section"><h3>Operations notes</h3><div className="form-field"><label htmlFor="shipment-notes">Notes</label><textarea className="small" name="notes" id="shipment-notes" defaultValue={shipment?.notes} data-testid="input-shipment-notes"/></div></section>
      <div className="modal-footer"><button className="button" type="button" onClick={onClose} data-testid="button-cancel-shipment">Cancel</button><button className="button button-primary" type="submit" data-testid="button-save-shipment"><Check size={15}/>{shipment?"Save changes":"Create shipment"}</button></div>
    </div></form>
  </div></div>;
}

function Detail({shipment,onEdit,onPrint,onTracking,updateCount}:{shipment:Shipment;onEdit:()=>void;onPrint:()=>void;onTracking:()=>void;updateCount:number}) {
  const balance=Math.max(0,Number(shipment.total)-Number(shipment.paid));
  return <aside className="panel detail-card" data-testid={`panel-shipment-detail-${shipment.id}`}>
    <div className="detail-head"><div><div className="detail-ref">{shipment.tracking}</div><span className={`status ${statusClass(shipment.status)}`}>{shipment.status}</span></div><div className="row-actions"><button className="icon-button" aria-label="Edit shipment" title="Edit" onClick={onEdit} data-testid={`button-edit-${shipment.id}`}><Pencil/></button><button className="icon-button" aria-label="Print shipment" title="Print record" onClick={onPrint} data-testid={`button-print-${shipment.id}`}><Printer/></button></div></div>
    <div className="detail-section tracking-actions"><h3>Tracking history</h3><p className="panel-note">{updateCount} recorded {updateCount===1?"update":"updates"} · stored in Supabase</p><button className="button button-small" type="button" onClick={onTracking} data-testid={`button-tracking-updates-${shipment.id}`}><MapPin size={14}/>{updateCount?"Review updates":"Add tracking update"}</button></div>
    <div className="detail-section"><h3>Movement</h3><div className="detail-grid"><DetailItem label="Mode / carrier" value={`${shipment.mode} · ${shipment.carrier||"Unassigned"}`}/><DetailItem label="Cargo" value={shipment.cargo}/><DetailItem label="Packages / weight" value={`${shipment.packages} packages · ${shipment.weight||"—"}`}/><DetailItem label="Pickup / ETA" value={`${niceDate(shipment.pickup)} / ${niceDate(shipment.estimated)}`}/></div></div>
    <div className="detail-section"><h3>Origin</h3><div className="detail-grid"><DetailItem label="Sender" value={shipment.sender}/><DetailItem label="Contact" value={`${shipment.senderEmail||"—"} · ${shipment.senderPhone||"—"}`}/><DetailItem label="Full location" value={fullOrigin(shipment)}/></div></div>
    <div className="detail-section"><h3>Destination</h3><div className="detail-grid"><DetailItem label="Recipient" value={shipment.recipient}/><DetailItem label="Contact" value={`${shipment.recipientEmail||"—"} · ${shipment.recipientPhone||"—"}`}/><DetailItem label="Full location" value={fullDestination(shipment)}/></div></div>
    <div className="detail-section"><h3>Payment</h3><div className="detail-grid"><DetailItem label="Custom fee" value={asMoney(shipment.customFee)}/><DetailItem label="Total charge / paid" value={`${asMoney(shipment.total)} / ${asMoney(shipment.paid)}`}/><DetailItem label="Balance due" value={asMoney(balance)}/><DetailItem label="Method / reference" value={`${shipment.paymentMethod||"—"} / ${shipment.paymentReference||"—"}`}/><DetailItem label="Payment status" value={shipment.paymentStatus}/></div></div>
  </aside>;
}
function DetailItem({label,value}:{label:string;value:string}) { return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div>; }

export default function AdminApp() {
  const [session,setSession]=useState<Session|null>(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [adminStatus,setAdminStatus]=useState<"checking"|"admin"|"forbidden"|"error"|"signed-out">("checking");
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[loginError,setLoginError]=useState("");
  const [shipments,setShipments]=useState<Shipment[]>([]);
  const [drafts,setDrafts]=useState<EmailDraft[]>([]);
  const [trackingUpdates,setTrackingUpdates]=useState<TrackingUpdate[]>([]);
  const [dataLoading,setDataLoading]=useState(false),[dataError,setDataError]=useState("");
  const [view,setView]=useState<View>("overview"),[selectedId,setSelectedId]=useState<string|null>(null),[search,setSearch]=useState(""),[filter,setFilter]=useState("All statuses");
  const [editing,setEditing]=useState<Shipment|undefined>(),[toast,setToast]=useState("");
  const [trackingModalShipment,setTrackingModalShipment]=useState<Shipment|null>(null),[printModalShipment,setPrintModalShipment]=useState<Shipment|null>(null);
  const [draftTracking,setDraftTracking]=useState(""),[draftRecipient,setDraftRecipient]=useState(""),[draftSubject,setDraftSubject]=useState(""),[draftBody,setDraftBody]=useState("");
  const [editingDraftId,setEditingDraftId]=useState<string|null>(null);
  const [sendingDraftId,setSendingDraftId]=useState<string|null>(null);
  const [sentDraftIds,setSentDraftIds]=useState<Set<string>>(()=>new Set());
  const notify=(message:string)=>{setToast(message);window.setTimeout(()=>setToast(""),2600);};

  useEffect(()=>{
    const supabaseClient=supabase;
    if(!supabaseClient){setAuthLoading(false);setAdminStatus("signed-out");return;}
    let active=true;
    let authEventReceived=false;
    let activeUserId:string|null=null;
    const checkAdmin=async(userId:string)=>{
      const {data,error}=await supabaseClient.rpc("is_qelvaron_admin");
      if(!active||activeUserId!==userId)return;
      if(error){setAdminStatus("error");setLoginError(error.message);return;}
      setAdminStatus(data===true?"admin":"forbidden");
    };
    const applySession=(nextSession:Session|null)=>{
      const nextUserId=nextSession?.user.id??null;
      const identityChanged=activeUserId!==nextUserId;
      activeUserId=nextUserId;
      setSession(nextSession);
      setAuthLoading(false);
      if(identityChanged){
        setShipments([]);setDrafts([]);setTrackingUpdates([]);setSelectedId(null);
        setDataError("");
        setAdminStatus(nextSession?"checking":"signed-out");
        if(nextSession)window.setTimeout(()=>void checkAdmin(nextSession.user.id),0);
      }
    };
    const {data:{subscription}}=supabaseClient.auth.onAuthStateChange((_event,nextSession)=>{
      authEventReceived=true;
      applySession(nextSession);
    });
    void supabaseClient.auth.getSession().then(({data,error})=>{
      if(!active||authEventReceived)return;
      if(error){setLoginError(error.message);setAdminStatus("signed-out");setAuthLoading(false);return;}
      applySession(data.session);
    });
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!session||adminStatus!=="admin")return;
    let active=true;
    setDataLoading(true);setDataError("");
    void Promise.all([
      supabaseRepository.shipments(),
      supabaseRepository.drafts(),
      supabaseRepository.trackingUpdates(),
    ]).then(([nextShipments,nextDrafts,nextUpdates])=>{
      if(!active)return;
      setShipments(nextShipments);setDrafts(nextDrafts);setTrackingUpdates(nextUpdates);
    }).catch(error=>{
      if(active)setDataError(error instanceof Error?error.message:"Supabase data could not be loaded.");
    }).finally(()=>{if(active)setDataLoading(false);});
    return ()=>{active=false;};
  },[session?.user.id,adminStatus]);

  const selected=shipments.find(s=>s.id===selectedId)||null;
  const visible=useMemo(()=>shipments.filter(s=>{
    const term=search.trim().toLowerCase();
    const matches=!term||[s.tracking,s.sender,s.recipient,s.originCity,s.destinationCity,s.carrier].some(v=>v.toLowerCase().includes(term));
    return matches&&(filter==="All statuses"||s.status===filter);
  }).sort((a,b)=>b.created.localeCompare(a.created)),[shipments,search,filter]);
  const balance=shipments.reduce((sum,s)=>sum+Math.max(0,Number(s.total)-Number(s.paid)),0);
  const inMotion=shipments.filter(s=>s.status==="In transit"||s.status==="Picked up").length;
  async function login(e:FormEvent){
    e.preventDefault();setLoginError("");
    if(!supabase)return;
    setAuthLoading(true);
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error){setAuthLoading(false);setLoginError("Sign-in failed. Check your email, password, and Supabase Auth setup.");}
  }
  async function logout(){
    if(supabase)await supabase.auth.signOut();
    setSession(null);setShipments([]);setDrafts([]);setTrackingUpdates([]);setAdminStatus("signed-out");
  }
  async function saveShipment(record:Shipment){
    try{
      const isUpdate=shipments.some(s=>s.id===record.id);
      const saved=await supabaseRepository.saveShipment(record,isUpdate);
      setShipments(current=>isUpdate?current.map(s=>s.id===saved.id?saved:s):[saved,...current]);
      setSelectedId(saved.id);setEditing(undefined);setView("shipments");
      notify("Shipment saved to Supabase.");
    }catch(error){notify(error instanceof Error?error.message:"Shipment could not be saved.");}
  }
  async function deleteShipment(s:Shipment){
    if(!window.confirm(`Permanently delete ${s.tracking} and its tracking history? This cannot be undone.`))return;
    try{
      await supabaseRepository.deleteShipment(s.id);
      setShipments(current=>current.filter(x=>x.id!==s.id));
      setTrackingUpdates(current=>current.filter(update=>update.shipmentId!==s.id));
      if(selectedId===s.id)setSelectedId(null);
      notify("Shipment deleted.");
    }catch(error){notify(error instanceof Error?error.message:"Shipment could not be deleted.");}
  }
  async function saveTrackingUpdate(input:Pick<TrackingUpdate,"status"|"location"|"description">){
    if(!trackingModalShipment)return;
    try{
      await supabaseRepository.saveTrackingUpdate(trackingModalShipment.id,input);
      const [nextShipments,nextUpdates]=await Promise.all([
        supabaseRepository.shipments(),
        supabaseRepository.trackingUpdates(),
      ]);
      setShipments(nextShipments);setTrackingUpdates(nextUpdates);
      setSelectedId(trackingModalShipment.id);setTrackingModalShipment(null);
      notify("Tracking update saved to Supabase.");
    }catch(error){notify(error instanceof Error?error.message:"Tracking update could not be saved.");}
  }
  function chooseShipment(s:Shipment){setSelectedId(s.id);setView("shipments");}
  function prepareDraft(s?:Shipment){setEditingDraftId(null);setDraftTracking(s?.tracking||"");setDraftRecipient(s?.recipientEmail||"");setDraftSubject(s?`Shipment update · ${s.tracking}`:"");setDraftBody(s?`Hello ${s.recipient},\n\nHere is a quick update about your shipment ${s.tracking}.\n\nCurrent status: ${s.status}\nEstimated delivery: ${niceDate(s.estimated)}\n\nPlease contact your logistics representative if you have questions.\n\nQelvaron Global Logistics`:"");setView("emails");}
  async function saveDraft(e:FormEvent){
    e.preventDefault();
    const match=shipments.find(s=>s.tracking===draftTracking);
    const draft:EmailDraft={id:editingDraftId||supabaseRepository.makeId(),shipmentId:match?.id??null,tracking:draftTracking,recipient:draftRecipient,subject:draftSubject,body:draftBody,updated:new Date().toISOString()};
    try{
      const saved=await supabaseRepository.saveDraft(draft);
      setDrafts(current=>current.some(item=>item.id===saved.id)?current.map(item=>item.id===saved.id?saved:item):[saved,...current]);
      setSentDraftIds(current=>{const next=new Set(current);next.delete(saved.id);return next;});
      setEditingDraftId(saved.id);
      notify(`${editingDraftId?"Draft updated":"Unsent draft saved"}${match?` for ${match.tracking}`:""} in Supabase.`);
    }catch(error){notify(error instanceof Error?error.message:"Email draft could not be saved.");}
  }
  async function sendDraft(draft:EmailDraft){
    if(sendingDraftId)return;
    const confirmed=window.confirm(`Send this email to ${draft.recipient}?\n\nSubject: ${draft.subject}\n\nIt will be sent through the connected Resend function.`);
    if(!confirmed)return;
    setSendingDraftId(draft.id);
    try{
      await sendSavedEmailDraft(draft.id);
      setSentDraftIds(current=>new Set(current).add(draft.id));
      notify(`Email sent to ${draft.recipient}.`);
    }catch(error){notify(error instanceof Error?error.message:"Email could not be sent.");}
    finally{setSendingDraftId(null);}
  }
  function printShipment(s:Shipment){setSelectedId(s.id);setPrintModalShipment(s);}
  function nav(to:View){setView(to);}

  if(!supabaseConfigured)return <div className="qelvaron-admin">
    <SiteHeader/>
    <main className="padding-global admin-login-main"><div className="container-large"><section className="padding-section-large admin-login-layout">
      <div className="admin-login-intro"><p className="text-size-small admin-kicker">Miami / Operations desk</p><h1 className="heading-style-h1 display-three admin-display-title">Shipment operations</h1><p className="admin-lede">Connect the Supabase project to use the secured operations desk.</p></div>
      <div className="admin-login-card"><p className="text-size-small admin-kicker">Setup required</p><h2 className="heading-style-h2 admin-card-title">Supabase is not configured</h2><p className="admin-card-copy">{getSupabaseConfigMessage()}</p><div className="login-warning"><strong>Use only the publishable key in the Vite app.</strong> Never add a Supabase service-role key to a <code>VITE_</code> variable.</div></div>
      <p className="admin-login-foot">Operational records are protected by Supabase Auth and row-level security.</p>
    </section></div></main>
  </div>;

  if(authLoading)return <div className="qelvaron-admin"><SiteHeader/><main className="padding-global admin-login-main"><div className="container-large"><section className="padding-section-large admin-login-layout"><div className="admin-login-card"><p className="text-size-small admin-kicker">Operations desk</p><h1 className="heading-style-h2 admin-card-title">Checking secure session</h1><p className="admin-card-copy">Connecting to Supabase Auth…</p></div></section></div></main></div>;

  if(session&&adminStatus!=="admin")return <div className="qelvaron-admin">
    <SiteHeader/>
    <main className="padding-global admin-login-main"><div className="container-large"><section className="padding-section-large admin-login-layout">
      <div className="admin-login-intro"><p className="text-size-small admin-kicker">Miami / Operations desk</p><h1 className="heading-style-h1 display-three admin-display-title">Shipment operations</h1><p className="admin-lede">Your Supabase account is signed in, but shipment records are available only to approved operators.</p></div>
      <div className="admin-login-card"><p className="text-size-small admin-kicker">{adminStatus==="checking"?"Checking access":"Access not enabled"}</p><h2 className="heading-style-h2 admin-card-title">{adminStatus==="checking"?"Confirming operator access":"Add this user as an operator"}</h2>
        {adminStatus==="checking"?<p className="admin-card-copy">Verifying your operator permissions…</p>:<><p className="admin-card-copy">{adminStatus==="error"?"Supabase could not verify the operator role. Confirm that supabase/schema.sql has been run.":"Run the bootstrap INSERT in supabase/README.md with this Auth user ID, then sign in again."}</p><code className="admin-user-id" data-testid="text-admin-user-id">{session.user.id}</code>{loginError&&<div className="notice" role="alert"><AlertTriangle/>{loginError}</div>}</>}
        <button className="button button-primary admin-submit" type="button" onClick={()=>void logout()}><LogOut size={15}/> Sign out</button>
      </div>
      <p className="admin-login-foot">Only user IDs explicitly added to <code>public.qelvaron_admins</code> can access operations data.</p>
    </section></div></main>
  </div>;

  if(!session)return <div className="qelvaron-admin">
    <SiteHeader/>
    <main className="padding-global admin-login-main">
      <div className="container-large">
        <section className="padding-section-large admin-login-layout">
          <div className="admin-login-intro">
            <p className="text-size-small admin-kicker">Miami / Operations desk</p>
            <h1 className="heading-style-h1 display-three admin-display-title">Shipment operations</h1>
            <p className="admin-lede">Manage Qelvaron’s shipment records, customer correspondence and waybills.</p>
          </div>
          <form className="admin-login-card" onSubmit={login}>
            <p className="text-size-small admin-kicker">Secure operator access</p>
            <h2 className="heading-style-h2 admin-card-title">Sign in to the desk</h2>
            <p className="admin-card-copy">Sign in with the Supabase Auth account approved for Qelvaron operations.</p>
            {loginError&&<div className="notice" role="alert" data-testid="status-login-error"><AlertTriangle/>{loginError}</div>}
            <div className="admin-form-stack">
              <div className="admin-field"><label className="contact-field-label" htmlFor="login-email">Email address</label><input className="contact-text-field" id="login-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username" data-testid="input-login-email"/></div>
              <div className="admin-field"><label className="contact-field-label" htmlFor="login-password">Password</label><input className="contact-text-field" id="login-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" data-testid="input-login-password"/></div>
            </div>
            <button className="primary-button w-variant-13a7ccd8-9ebe-d094-481f-e24b4fc8f662 admin-submit" type="submit" disabled={authLoading} data-testid="button-admin-login">{authLoading?"Signing in…":"Enter operations desk"} <ArrowLeft size={15} style={{transform:"rotate(180deg)"}}/></button>
            <div className="login-warning"><strong>First-time setup:</strong> create the operator in Supabase Authentication, then add their Auth user ID to <code>public.qelvaron_admins</code> using the SQL in <code>supabase/README.md</code>.</div>
          </form>
          <p className="admin-login-foot">Shipment records are protected by Supabase row-level security. Email sending remains disabled.</p>
        </section>
      </div>
    </main>
  </div>;

  return <>
    <div className="qelvaron-admin">
      <SiteHeader/>
      <div className="admin-nav-band">
        <div className="container-large admin-nav-row">
          <nav className="admin-section-nav" aria-label="Operations navigation">
            <AdminNavButton active={view==="overview"} label="Overview" onClick={()=>nav("overview")} testid="nav-overview"/>
            <span className="nav-slash">/</span>
            <AdminNavButton active={view==="shipments"} label="Shipments" onClick={()=>nav("shipments")} testid="nav-shipments" count={shipments.length}/>
            <span className="nav-slash">/</span>
            <AdminNavButton active={view==="emails"} label="Email drafts" onClick={()=>nav("emails")} testid="nav-email-drafts" count={drafts.length}/>
          </nav>
          <div className="admin-nav-actions"><span className="admin-preview-label">Supabase connected</span><button className="nav-link admin-signout" onClick={()=>void logout()} data-testid="button-logout"><LogOut size={14}/> Sign out</button></div>
        </div>
      </div>
      <main className="padding-global admin-main">
        <div className="container-large">
          <div className="admin-page-topline"><span>Qelvaron Global Logistics / {view==="overview"?"Operations":view==="shipments"?"Shipment register":"Correspondence"}</span><span>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</span></div>
          <div className="admin-content">
          {dataError&&<div className="notice" role="alert" style={{marginBottom:15}}><AlertTriangle/><span><strong>Supabase data could not be loaded.</strong> {dataError}</span></div>}
          {dataLoading&&<div className="notice" role="status" style={{marginBottom:15}}>Loading live operational data from Supabase…</div>}
          {view==="overview"&&<Overview shipments={shipments} balance={balance} inMotion={inMotion} onViewAll={()=>nav("shipments")} onCreate={()=>setEditing({...emptyShipment,id:"",tracking:"",created:""})} onSelect={chooseShipment}/>}
          {view==="shipments"&&<section><div className="page-head"><div><p className="text-size-small admin-kicker">Shipment register</p><h1 className="heading-style-h1 admin-page-title">Shipments</h1><p className="admin-page-subtitle">Create, update and review live shipment records stored in Supabase.</p></div><button className="button button-primary" onClick={()=>setEditing({...emptyShipment,id:"",tracking:"",created:""})} data-testid="button-create-shipment"><PackagePlus size={16}/> Create shipment</button></div>
            <div className="list-layout"><div className="panel"><div className="toolbar"><div className="searchbox"><Search/><input className="field-control" placeholder="Search tracking, name, city, carrier" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search shipments" data-testid="input-search-shipments"/></div><select className="field-control" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter by status" data-testid="select-filter-status"><option>All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
              <ShipmentTable shipments={visible} selectedId={selectedId} onSelect={chooseShipment} onEdit={s=>setEditing(s)} onDelete={deleteShipment} onPrint={printShipment}/>
            </div>{selected?<Detail shipment={selected} onEdit={()=>setEditing(selected)} onPrint={()=>printShipment(selected)} onTracking={()=>setTrackingModalShipment(selected)} updateCount={trackingUpdates.filter(update=>update.shipmentId===selected.id).length}/>:<div className="panel empty-state"><div className="empty-mark"><ClipboardList/></div><h3>Select a shipment</h3><p>Choose a row to inspect full contacts, locations and payment details.</p></div>}</div>
          </section>}
          {view==="emails"&&<section><div className="page-head"><div><p className="text-size-small admin-kicker">Customer correspondence</p><h1 className="heading-style-h1 admin-page-title">Email drafts</h1><p className="admin-page-subtitle">Prepare shipment updates, save them in Supabase, and send them through the secured Resend function.</p></div><button className="button button-primary" type="button" onClick={()=>prepareDraft()} data-testid="button-new-draft"><Plus size={15}/> New draft</button></div>
            <div className="notice" style={{marginBottom:15}}><Mail/><span><strong>Review before sending.</strong> Sending a saved draft requires confirmation and uses your deployed Resend function.</span></div>
            <div className="email-layout"><form className="panel form-panel" onSubmit={saveDraft}><h2 className="form-title">{editingDraftId?"Edit unsent message":"Compose an unsent message"}</h2><div className="form-grid">
              <div className="form-field"><label htmlFor="draft-shipment">Shipment</label><select id="draft-shipment" className="field-control" value={draftTracking} onChange={e=>{const t=e.target.value;setDraftTracking(t);const s=shipments.find(x=>x.tracking===t);if(s){setDraftRecipient(s.recipientEmail);setDraftSubject(`Shipment update · ${s.tracking}`);setDraftBody(`Hello ${s.recipient},\n\nHere is a quick update about your shipment ${s.tracking}.\n\nCurrent status: ${s.status}\nEstimated delivery: ${niceDate(s.estimated)}\n\nPlease contact your logistics representative if you have questions.\n\nQelvaron Global Logistics`);}}} data-testid="select-draft-shipment"><option value="">Choose shipment (optional)</option>{shipments.map(s=><option key={s.id} value={s.tracking}>{s.tracking} · {s.recipient}</option>)}</select></div>
              <div className="form-field"><label htmlFor="draft-recipient">Recipient email</label><input id="draft-recipient" type="email" value={draftRecipient} onChange={e=>setDraftRecipient(e.target.value)} required data-testid="input-draft-recipient"/></div>
              <div className="form-field full"><label htmlFor="draft-subject">Subject</label><input id="draft-subject" value={draftSubject} onChange={e=>setDraftSubject(e.target.value)} required data-testid="input-draft-subject"/></div>
              <div className="form-field full"><label htmlFor="draft-body">Message</label><textarea id="draft-body" value={draftBody} onChange={e=>setDraftBody(e.target.value)} required data-testid="input-draft-body"/></div>
            </div><div className="form-footer"><span style={{fontSize:10,color:"#85909a"}}>Saved drafts remain unsent.</span><button className="button button-primary" type="submit" data-testid="button-save-draft"><Check size={15}/> {editingDraftId?"Update draft":"Save draft"}</button></div></form>
              <div className="panel"><div className="panel-head"><div><h2 className="panel-title">Saved drafts</h2><p className="panel-note">{drafts.length} unsent {drafts.length===1?"draft":"drafts"}</p></div><FileText size={16} color="#79848f"/></div>
                {drafts.length?<div className="draft-list">{drafts.map(d=><div key={d.id} className="draft-item" role="group" aria-label={`Email draft for ${d.recipient}`}>
                  <button className="draft-item-select" type="button" onClick={()=>{setEditingDraftId(d.id);setDraftTracking(d.tracking);setDraftRecipient(d.recipient);setDraftSubject(d.subject);setDraftBody(d.body);}} data-testid={`draft-item-${d.id}`}>
                    <strong>{d.subject||"(No subject)"}</strong><span>{d.recipient} · {d.tracking||"No shipment"} · {sentDraftIds.has(d.id)?"Sent this session":"Saved draft"}</span>
                  </button>
                  <button className="button button-primary draft-send-button" type="button" onClick={()=>void sendDraft(d)} disabled={sendingDraftId!==null||sentDraftIds.has(d.id)} aria-label={`Send ${d.subject||"email draft"} to ${d.recipient}`} data-testid={`button-send-draft-${d.id}`}>
                    <Send size={14}/>{sendingDraftId===d.id?"Sending…":sentDraftIds.has(d.id)?"Sent":"Send"}
                  </button>
                </div>)}</div>:<div className="empty-state" style={{padding:"30px 16px"}}><div className="empty-mark"><Mail/></div><h3>No saved drafts</h3><p>Write a shipment update and save it here for review.</p></div>}
              </div></div>
          </section>}
          </div>
        </div>
      </main>
    </div>
    {editing&&<ShipmentModal shipment={editing.id?editing:undefined} onClose={()=>setEditing(undefined)} onSave={saveShipment}/>}
    {trackingModalShipment&&<TrackingUpdatesModal shipment={trackingModalShipment} updates={trackingUpdates} onClose={()=>setTrackingModalShipment(null)} onSave={saveTrackingUpdate}/>}
    {printModalShipment&&<PrintInvoiceModal shipment={printModalShipment} onClose={()=>setPrintModalShipment(null)} onPrint={()=>window.print()}><PrintSheet shipment={printModalShipment} preview/></PrintInvoiceModal>}
    {toast&&<div className="toast" role="status" data-testid="status-toast">{toast}</div>}
    {selected&&<PrintSheet shipment={selected}/>}
  </>;
}

function SiteHeader(){
  const [menuOpen,setMenuOpen]=useState(false);
  const links=[["Home","/"],["Services","/services/"],["About Us","/about/"],["Contact Us","/contact/"],["How It Works","/how-it-works/"],["Tracking","/tracking/"]];
  return <header className="qelvaron-site-header">
    <div data-wf--navbar--variant="secondary" data-animation="default" data-collapse="medium" role="banner" className="navbar w-variant-b70c6a90-d637-7a16-8a9b-9a8545e8ba2c w-nav">
      <div className="container-large nav">
        <a href="/" className="brand-link w-inline-block" aria-label="Qelvaron Global Logistics home">
          <img loading="lazy" src="/qelvaron-logo-light.svg" alt="Qelvaron Global Logistics" className="brand-logo base w-variant-b70c6a90-d637-7a16-8a9b-9a8545e8ba2c"/>
          <img loading="lazy" src="/qelvaron-logo-dark.svg" alt="Qelvaron Global Logistics" className="brand-logo secondary w-variant-b70c6a90-d637-7a16-8a9b-9a8545e8ba2c"/>
        </a>
        <nav role="navigation" aria-label="Qelvaron public navigation" className={`nav-menu w-nav-menu ${menuOpen?"admin-nav-open":""}`}>
          {links.map(([label,href],index)=><span className="site-nav-pair" key={href}>
            {index>0&&<span className="nav-slash w-variant-b70c6a90-d637-7a16-8a9b-9a8545e8ba2c">/</span>}
            <a nav-link="" href={href} className="nav-link w-variant-b70c6a90-d637-7a16-8a9b-9a8545e8ba2c"><span>{label}</span></a>
          </span>)}
        </nav>
        <div className="nav-right-content">
          <button type="button" className="menu w-nav-button admin-menu-toggle" aria-label={menuOpen?"Close navigation":"Open navigation"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)} data-testid="button-site-menu">{menuOpen?<X/>:<Menu/>}</button>
          <div className="nav-buttons-wrap">
            <a href="/contact/" className="primary-button w-variant-13a7ccd8-9ebe-d094-481f-e24b4fc8f662 w-inline-block">
              <div className="primary-button-text"><span>Get Quote</span></div>
              <div className="button-arrow-box"><svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 16 12" fill="none" className="button-arrow _01"><path d="M14 5.53023L0 5.53027M9.00002 0.530273L14 5.53023L9.00006 10.5303" stroke="currentColor" strokeWidth="1.5"/></svg></div>
              <div className="primary-hover-bg"/>
            </a>
          </div>
        </div>
      </div>
    </div>
  </header>;
}
function AdminNavButton({active,label,onClick,testid,count}:{active:boolean;label:string;onClick:()=>void;testid:string;count?:number}){
  return <button type="button" className={`nav-link admin-tab ${active?"w--current":""}`} onClick={onClick} aria-current={active?"page":undefined} data-testid={testid}><span>{label}</span>{count!==undefined&&<span className="admin-tab-count">{count}</span>}</button>;
}
function Overview({shipments,balance,inMotion,onViewAll,onCreate,onSelect}:{shipments:Shipment[];balance:number;inMotion:number;onViewAll:()=>void;onCreate:()=>void;onSelect:(s:Shipment)=>void}){
  const booked=shipments.filter(s=>s.status==="Booked").length;
  return <section><div className="page-head"><div><p className="text-size-small admin-kicker">Operations snapshot</p><h1 className="heading-style-h1 admin-page-title">Good day. Here’s the desk.</h1><p className="admin-page-subtitle">A current view of your shipment activity and outstanding balances.</p></div><button className="button button-primary" onClick={onCreate} data-testid="button-overview-create"><Plus size={15}/> New shipment</button></div>
      <div className="notice" style={{marginBottom:18}}><AlertTriangle/><span><strong>Live operations data.</strong> Shipment records and tracking updates are stored in Supabase and shared across approved operator accounts. Email drafts are saved but not sent.</span></div>
    <div className="metric-grid">
      <Metric label="Total shipments" value={String(shipments.length).padStart(2,"0")} foot="Across all statuses"/>
      <Metric label="In motion" value={String(inMotion).padStart(2,"0")} foot="Picked up or in transit"/>
      <Metric label="Awaiting pickup" value={String(booked).padStart(2,"0")} foot="Booked shipments"/>
      <Metric label="Balance outstanding" value={asMoney(balance)} foot="Calculated from shipment charges"/>
    </div>
    <div className="panel"><div className="panel-head"><div><h2 className="panel-title">Recent shipments</h2><p className="panel-note">Latest activity across all recorded shipments</p></div><button className="button button-small" onClick={onViewAll} data-testid="button-view-all-shipments">View all <ArrowDownToLine size={14}/></button></div><ShipmentTable shipments={[...shipments].sort((a,b)=>b.created.localeCompare(a.created)).slice(0,5)} onSelect={onSelect}/></div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(240px,330px)",gap:14,marginTop:15}} className="overview-bottom">
      <div className="panel" style={{padding:18}}><p className="eyebrow">Desk note</p><h2 style={{fontSize:16,margin:"0 0 7px"}}>Keep the next handoff clear.</h2><p style={{fontSize:11,lineHeight:1.6,color:"#75808a",margin:0}}>Each record holds the shipment route, people, cargo, dates and payment details together for quick follow-up.</p></div>
      <div className="panel" style={{padding:18}}><p className="eyebrow">Quick action</p><button className="button button-dark" style={{width:"100%"}} onClick={onCreate} data-testid="button-quick-create"><PackagePlus size={15}/> Record a shipment</button><p style={{fontSize:10,lineHeight:1.5,color:"#7c8791",margin:"9px 0 0"}}>Creates a shared shipment record and generates its tracking reference.</p></div>
    </div>
  </section>;
}
function Metric({label,value,foot}:{label:string;value:string;foot:string}){return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value" data-testid={`metric-${label.toLowerCase().replaceAll(" ","-")}`}>{value}</div><div className="metric-foot">{foot}</div></article>}
function ShipmentTable({shipments,selectedId,onSelect,onEdit,onDelete,onPrint}:{shipments:Shipment[];selectedId?:string|null;onSelect:(s:Shipment)=>void;onEdit?:(s:Shipment)=>void;onDelete?:(s:Shipment)=>void;onPrint?:(s:Shipment)=>void}){
  if(!shipments.length)return <div className="empty-state" data-testid="empty-shipments"><div className="empty-mark"><Ship/></div><h3>No shipments match</h3><p>Try changing the search or status filter, or create a new shipment.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>Tracking reference</th><th>Recipient / destination</th><th>Created</th><th>Mode</th><th>Status</th><th>Balance due</th><th>Actions</th></tr></thead><tbody>{shipments.map(s=><tr key={s.id} onClick={()=>onSelect(s)} style={{background:selectedId===s.id?"#fff8f4":undefined,cursor:"pointer"}} data-testid={`row-shipment-${s.id}`}>
    <td data-label="Tracking"><span className="track">{s.tracking}</span><span className="cell-sub">{s.sender}</span></td>
    <td data-label="Destination">{s.recipient}<span className="cell-sub">{s.destinationCity}, {s.destinationCountry}</span></td>
    <td data-label="Created">{niceDate(s.created)}</td><td data-label="Mode">{s.mode}</td>
    <td data-label="Status"><span className={`status ${statusClass(s.status)}`}>{s.status}</span></td><td data-label="Balance">{asMoney(Math.max(0,Number(s.total)-Number(s.paid)))}</td>
    <td data-label="Actions" onClick={e=>e.stopPropagation()}><div className="row-actions">
      {onEdit&&<button className="icon-button" onClick={()=>onEdit(s)} aria-label={`Edit ${s.tracking}`} title="Edit shipment" data-testid={`button-row-edit-${s.id}`}><Pencil/></button>}
      {onPrint&&<button className="icon-button" onClick={()=>onPrint(s)} aria-label={`Print ${s.tracking}`} title="Print record" data-testid={`button-row-print-${s.id}`}><Printer/></button>}
      {onDelete&&<button className="icon-button" onClick={()=>onDelete(s)} aria-label={`Delete ${s.tracking}`} title="Delete shipment" data-testid={`button-row-delete-${s.id}`}><Trash2/></button>}
    </div></td>
  </tr>)}</tbody></table></div>;
}
function PrintSheet({shipment:s,preview=false}:{shipment:Shipment;preview?:boolean}){
  const fee=Number(s.customFee)||0,shippingCharge=Math.max(0,Number(s.total)-fee),bal=Math.max(0,Number(s.total)-Number(s.paid));
  return <article className={`print-sheet${preview?" print-preview-sheet":""}`} data-testid={preview?"print-invoice-preview":"print-shipment-record"}>
    <div className="print-header"><img src="/qelvaron-logo-dark.svg" alt="Qelvaron Global Logistics"/><div className="print-title"><h1>Shipment waybill</h1><p>Operations record · Preview copy</p></div></div>
    <div className="print-ref"><span>Tracking reference</span><strong>{s.tracking}</strong><span className={`status ${statusClass(s.status)}`}>{s.status}</span></div>
    <div className="print-columns">
      <PrintBlock title="Sender / Origin"><p><b>{s.sender}</b></p><p>{s.senderEmail} · {s.senderPhone}</p><p>{fullOrigin(s)}</p></PrintBlock>
      <PrintBlock title="Recipient / Destination"><p><b>{s.recipient}</b></p><p>{s.recipientEmail} · {s.recipientPhone}</p><p>{fullDestination(s)}</p></PrintBlock>
      <PrintBlock title="Shipment details"><p><b>Cargo:</b> {s.cargo}</p><p><b>Mode / carrier:</b> {s.mode} / {s.carrier}</p><p><b>Packages:</b> {s.packages} &nbsp; <b>Weight:</b> {s.weight}</p><p><b>Dimensions:</b> {s.dimensions}</p><p><b>Pickup:</b> {niceDate(s.pickup)} &nbsp; <b>Estimated delivery:</b> {niceDate(s.estimated)}</p></PrintBlock>
      <PrintBlock title="Payment"><div className="print-payment"><div>Shipping charge<b>{asMoney(shippingCharge)}</b></div><div>Custom fee<b>{asMoney(fee)}</b></div><div>Total charge<b>{asMoney(s.total)}</b></div><div>Amount paid<b>{asMoney(s.paid)}</b></div><div>Balance due<b>{asMoney(bal)}</b></div><div>Payment status<b>{s.paymentStatus}</b></div></div><p style={{marginTop:9}}><b>Method:</b> {s.paymentMethod||"—"} &nbsp; <b>Reference:</b> {s.paymentReference||"—"}</p></PrintBlock>
      {s.notes&&<PrintBlock title="Operations notes" full><p>{s.notes}</p></PrintBlock>}
    </div><div className="print-footer">Record created {niceDate(s.created)} · This document contains only the shipment locations and contact details entered into this record.</div>
  </article>;
}
function PrintBlock({title,children,full=false}:{title:string;children:ReactNode;full?:boolean}){return <section className={`print-block ${full?"full":""}`}><h2>{title}</h2>{children}</section>}
