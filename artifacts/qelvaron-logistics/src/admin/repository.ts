import { supabase } from "@/lib/supabase";

export type ShipmentStatus =
  | "Booked"
  | "Picked up"
  | "In transit"
  | "Stopover"
  | "Held by Customs"
  | "Out for delivery"
  | "Delayed"
  | "Delivered"
  | "Exception"
  | "Failed delivery";

export type PaymentStatus = "Pending" | "Partial" | "Paid" | "Overdue";

export type TrackingUpdate = {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  location: string;
  description: string;
  timestamp: string;
};

export type Shipment = {
  id: string;
  tracking: string;
  created: string;
  status: ShipmentStatus;
  mode: string;
  carrier: string;
  sender: string;
  senderEmail: string;
  senderPhone: string;
  originStreet: string;
  originCity: string;
  originRegion: string;
  originPostal: string;
  originCountry: string;
  recipient: string;
  recipientEmail: string;
  recipientPhone: string;
  destinationStreet: string;
  destinationCity: string;
  destinationRegion: string;
  destinationPostal: string;
  destinationCountry: string;
  cargo: string;
  packages: string;
  weight: string;
  dimensions: string;
  pickup: string;
  estimated: string;
  customFee: string;
  total: string;
  paid: string;
  paymentMethod: string;
  paymentReference: string;
  paymentStatus: PaymentStatus;
  notes: string;
};

export type EmailDraft = {
  id: string;
  shipmentId: string | null;
  tracking: string;
  recipient: string;
  subject: string;
  body: string;
  updated: string;
};

type ShipmentRow = {
  id: string;
  tracking_number: string;
  created_at: string;
  status: ShipmentStatus;
  mode: string;
  carrier: string;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  origin_street: string;
  origin_city: string;
  origin_region: string;
  origin_postal: string;
  origin_country: string;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  destination_street: string;
  destination_city: string;
  destination_region: string;
  destination_postal: string;
  destination_country: string;
  cargo: string;
  package_count: number;
  weight: string;
  dimensions: string;
  pickup_date: string | null;
  estimated_delivery: string | null;
  custom_fee: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  payment_method: string;
  payment_reference: string;
  payment_status: PaymentStatus;
  notes: string;
};

type TrackingUpdateRow = {
  id: string;
  shipment_id: string;
  status: ShipmentStatus;
  location: string;
  description: string;
  created_at: string;
};

type EmailDraftRow = {
  id: string;
  shipment_id: string | null;
  tracking_reference: string;
  recipient: string;
  subject: string;
  body: string;
  updated_at: string;
};

function client() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return supabase;
}

function fromShipmentRow(row: ShipmentRow): Shipment {
  return {
    id: row.id,
    tracking: row.tracking_number,
    created: row.created_at.slice(0, 10),
    status: row.status,
    mode: row.mode,
    carrier: row.carrier,
    sender: row.sender_name,
    senderEmail: row.sender_email,
    senderPhone: row.sender_phone,
    originStreet: row.origin_street,
    originCity: row.origin_city,
    originRegion: row.origin_region,
    originPostal: row.origin_postal,
    originCountry: row.origin_country,
    recipient: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    destinationStreet: row.destination_street,
    destinationCity: row.destination_city,
    destinationRegion: row.destination_region,
    destinationPostal: row.destination_postal,
    destinationCountry: row.destination_country,
    cargo: row.cargo,
    packages: String(row.package_count),
    weight: row.weight,
    dimensions: row.dimensions,
    pickup: row.pickup_date ?? "",
    estimated: row.estimated_delivery ?? "",
    customFee: String(row.custom_fee),
    total: String(row.total_amount),
    paid: String(row.amount_paid),
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    paymentStatus: row.payment_status,
    notes: row.notes,
  };
}

function toShipmentRow(shipment: Shipment) {
  return {
    status: shipment.status,
    mode: shipment.mode,
    carrier: shipment.carrier,
    sender_name: shipment.sender,
    sender_email: shipment.senderEmail,
    sender_phone: shipment.senderPhone,
    origin_street: shipment.originStreet,
    origin_city: shipment.originCity,
    origin_region: shipment.originRegion,
    origin_postal: shipment.originPostal,
    origin_country: shipment.originCountry,
    recipient_name: shipment.recipient,
    recipient_email: shipment.recipientEmail,
    recipient_phone: shipment.recipientPhone,
    destination_street: shipment.destinationStreet,
    destination_city: shipment.destinationCity,
    destination_region: shipment.destinationRegion,
    destination_postal: shipment.destinationPostal,
    destination_country: shipment.destinationCountry,
    cargo: shipment.cargo,
    package_count: Math.max(1, Number.parseInt(shipment.packages, 10) || 1),
    weight: shipment.weight,
    dimensions: shipment.dimensions,
    pickup_date: shipment.pickup || null,
    estimated_delivery: shipment.estimated || null,
    custom_fee: Number(shipment.customFee) || 0,
    total_amount: Number(shipment.total) || 0,
    amount_paid: Number(shipment.paid) || 0,
    payment_method: shipment.paymentMethod,
    payment_reference: shipment.paymentReference,
    payment_status: shipment.paymentStatus,
    notes: shipment.notes,
  };
}

export const supabaseRepository = {
  async shipments(): Promise<Shipment[]> {
    const { data, error } = await client()
      .from("shipments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return ((data ?? []) as ShipmentRow[]).map(fromShipmentRow);
  },

  async saveShipment(
    shipment: Shipment,
    isUpdate: boolean,
  ): Promise<Shipment> {
    const request = client().from("shipments");
    const result = isUpdate
      ? await request
          .update(toShipmentRow(shipment))
          .eq("id", shipment.id)
          .select("*")
          .single()
      : await request
          .insert(toShipmentRow(shipment))
          .select("*")
          .single();

    if (result.error) throw result.error;
    return fromShipmentRow(result.data as ShipmentRow);
  },

  async deleteShipment(id: string): Promise<void> {
    const { error } = await client().from("shipments").delete().eq("id", id);
    if (error) throw error;
  },

  async trackingUpdates(): Promise<TrackingUpdate[]> {
    const { data, error } = await client()
      .from("tracking_updates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return ((data ?? []) as TrackingUpdateRow[]).map((row) => ({
      id: row.id,
      shipmentId: row.shipment_id,
      status: row.status,
      location: row.location,
      description: row.description,
      timestamp: row.created_at,
    }));
  },

  async saveTrackingUpdate(
    shipmentId: string,
    input: Pick<TrackingUpdate, "status" | "location" | "description">,
  ): Promise<void> {
    const { error } = await client().rpc("record_tracking_update", {
      p_shipment_id: shipmentId,
      p_status: input.status,
      p_location: input.location,
      p_description: input.description,
    });

    if (error) throw error;
  },

  async drafts(): Promise<EmailDraft[]> {
    const { data, error } = await client()
      .from("email_drafts")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return ((data ?? []) as EmailDraftRow[]).map((row) => ({
      id: row.id,
      shipmentId: row.shipment_id,
      tracking: row.tracking_reference,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      updated: row.updated_at,
    }));
  },

  async saveDraft(draft: EmailDraft): Promise<EmailDraft> {
    const { data, error } = await client()
      .from("email_drafts")
      .upsert(
        {
          id: draft.id,
          shipment_id: draft.shipmentId,
          tracking_reference: draft.tracking,
          recipient: draft.recipient,
          subject: draft.subject,
          body: draft.body,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error) throw error;
    const row = data as EmailDraftRow;
    return {
      id: row.id,
      shipmentId: row.shipment_id,
      tracking: row.tracking_reference,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      updated: row.updated_at,
    };
  },

  makeId(): string {
    return crypto.randomUUID();
  },
};
