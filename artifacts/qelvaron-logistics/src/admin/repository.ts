export type ShipmentStatus = "Booked" | "Picked up" | "In transit" | "Delivered" | "Exception";
export type PaymentStatus = "Pending" | "Partial" | "Paid" | "Overdue";
export type Shipment = {
  id: string; tracking: string; created: string; status: ShipmentStatus; mode: string; carrier: string;
  sender: string; senderEmail: string; senderPhone: string; originStreet: string; originCity: string; originRegion: string; originPostal: string; originCountry: string;
  recipient: string; recipientEmail: string; recipientPhone: string; destinationStreet: string; destinationCity: string; destinationRegion: string; destinationPostal: string; destinationCountry: string;
  cargo: string; packages: string; weight: string; dimensions: string; pickup: string; estimated: string;
  total: string; paid: string; paymentMethod: string; paymentReference: string; paymentStatus: PaymentStatus; notes: string;
};
export type EmailDraft = { id: string; tracking: string; recipient: string; subject: string; body: string; updated: string };
const SHIPMENTS_KEY = "qelvaron-admin-demo-shipments-v1";
const DRAFTS_KEY = "qelvaron-admin-demo-drafts-v1";
const synthetic: Shipment[] = [
  {id:"demo-001",tracking:"QGL-260614-0821",created:"2026-06-14",status:"In transit",mode:"Air",carrier:"SkyBridge Cargo",sender:"Marina Ortiz",senderEmail:"marina.ortiz@example.test",senderPhone:"+1 305 555 0148",originStreet:"1840 NW 21st Terrace",originCity:"Miami",originRegion:"FL",originPostal:"33142",originCountry:"United States",recipient:"Lucía Herrera",recipientEmail:"lucia.herrera@example.test",recipientPhone:"+57 601 555 0193",destinationStreet:"Carrera 13 # 82-45",destinationCity:"Bogotá",destinationRegion:"Cundinamarca",destinationPostal:"110221",destinationCountry:"Colombia",cargo:"Commercial textile samples",packages:"4",weight:"68.5 kg",dimensions:"60 × 45 × 38 cm",pickup:"2026-06-14",estimated:"2026-06-19",total:"842.50",paid:"500.00",paymentMethod:"Wire transfer",paymentReference:"DEMO-WIRE-092",paymentStatus:"Partial",notes:"Synthetic sample record for preview only."},
  {id:"demo-002",tracking:"QGL-260612-0714",created:"2026-06-12",status:"Booked",mode:"Sea",carrier:"Atlantic Meridian",sender:"Daniel Brooks",senderEmail:"daniel.brooks@example.test",senderPhone:"+1 786 555 0172",originStreet:"9400 NW 36th Street, Suite 210",originCity:"Doral",originRegion:"FL",originPostal:"33178",originCountry:"United States",recipient:"Renato Alves",recipientEmail:"renato.alves@example.test",recipientPhone:"+55 11 5555 0186",destinationStreet:"Av. Paulista 1450",destinationCity:"São Paulo",destinationRegion:"SP",destinationPostal:"01310-100",destinationCountry:"Brazil",cargo:"Display fixtures",packages:"12",weight:"224 kg",dimensions:"120 × 80 × 76 cm",pickup:"2026-06-17",estimated:"2026-07-05",total:"1,640.00",paid:"1,640.00",paymentMethod:"Card",paymentReference:"DEMO-CARD-31",paymentStatus:"Paid",notes:"Synthetic sample record for preview only."},
  {id:"demo-003",tracking:"QGL-260610-0438",created:"2026-06-10",status:"Delivered",mode:"Road",carrier:"Coastal Freight",sender:"Elena Rivera",senderEmail:"elena.rivera@example.test",senderPhone:"+1 305 555 0160",originStreet:"2801 NW 79th Avenue",originCity:"Doral",originRegion:"FL",originPostal:"33122",originCountry:"United States",recipient:"Camila Torres",recipientEmail:"camila.torres@example.test",recipientPhone:"+1 809 555 0197",destinationStreet:"Calle El Conde 88",destinationCity:"Santo Domingo",destinationRegion:"Distrito Nacional",destinationPostal:"10210",destinationCountry:"Dominican Republic",cargo:"Household goods",packages:"7",weight:"143 kg",dimensions:"Mixed cartons",pickup:"2026-06-10",estimated:"2026-06-13",total:"597.25",paid:"597.25",paymentMethod:"Cash",paymentReference:"DEMO-CASH-17",paymentStatus:"Paid",notes:"Synthetic sample record for preview only."}
];
function read<T>(key:string,fallback:T):T { try { const value=localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function write<T>(key:string,value:T):void { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Storage can be unavailable in private browsing; keep the current session functional. */ } }
export const demoRepository = {
  shipments():Shipment[] { const saved=read<Shipment[]|null>(SHIPMENTS_KEY,null); if(saved) return saved; write(SHIPMENTS_KEY,synthetic); return synthetic; },
  saveShipments(value:Shipment[]):void { write(SHIPMENTS_KEY,value); },
  drafts():EmailDraft[] { return read<EmailDraft[]>(DRAFTS_KEY,[]); },
  saveDrafts(value:EmailDraft[]):void { write(DRAFTS_KEY,value); },
  makeId():string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }
};
