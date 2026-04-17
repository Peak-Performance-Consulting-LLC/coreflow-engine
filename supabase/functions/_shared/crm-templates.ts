export type CRMType =
  | 'real-estate'
  | 'gas-station'
  | 'convenience-store'
  | 'restaurant'
  | 'auto-repair';

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select';

export interface StageTemplate {
  name: string;
  color?: string;
  is_closed?: boolean;
  win_probability?: number | null;
}

export interface SourceTemplate {
  name: string;
  source_type?: string;
}

export interface CustomFieldTemplate {
  field_key: string;
  label: string;
  field_type: FieldType;
  is_required?: boolean;
  placeholder?: string;
  help_text?: string;
  default_value?: unknown;
  options?: string[];
  validation_rules?: Record<string, unknown>;
}

export interface CrmTemplateDefinition {
  pipelineName: string;
  stages: StageTemplate[];
  sources: SourceTemplate[];
  fields: CustomFieldTemplate[];
}

export const crmTemplates: Record<CRMType, CrmTemplateDefinition> = {
  'real-estate': {
    pipelineName: 'Real Estate Pipeline',
    stages: [
      { name: 'New Inquiry', color: '#38bdf8', win_probability: 5 },
      { name: 'Contacted', color: '#60a5fa', win_probability: 15 },
      { name: 'Site Visit Scheduled', color: '#a78bfa', win_probability: 35 },
      { name: 'Negotiation', color: '#f59e0b', win_probability: 65 },
      { name: 'Booked', color: '#10b981', is_closed: true, win_probability: 100 },
      { name: 'Lost', color: '#ef4444', is_closed: true, win_probability: 0 },
    ],
    sources: [
      { name: 'Property Portal', source_type: 'portal' },
      { name: 'Broker Referral', source_type: 'referral' },
      { name: 'Walk In', source_type: 'offline' },
      { name: 'Social Campaign', source_type: 'marketing' },
    ],
    fields: [
      { field_key: 'property_type', label: 'Property Type', field_type: 'select', options: ['Apartment', 'Villa', 'Plot', 'Commercial'], is_required: true, help_text: 'What kind of property is the lead interested in?' },
      { field_key: 'budget', label: 'Budget', field_type: 'number', placeholder: '250000', help_text: 'Expected budget or spending ceiling.' },
      { field_key: 'preferred_location', label: 'Preferred Location', field_type: 'text', placeholder: 'Downtown / Suburb', is_required: true },
      { field_key: 'possession_timeline', label: 'Possession Timeline', field_type: 'select', options: ['Immediate', '1-3 months', '3-6 months', '6+ months'] },
      { field_key: 'financing_required', label: 'Needs Financing', field_type: 'boolean', default_value: false },
      { field_key: 'move_in_target_date', label: 'Target Move-In Date', field_type: 'date' },
    ],
  },
  restaurant: {
    pipelineName: 'Restaurant Expansion Pipeline',
    stages: [
      { name: 'New Lead', color: '#38bdf8', win_probability: 5 },
      { name: 'Qualified', color: '#60a5fa', win_probability: 20 },
      { name: 'Discovery Call', color: '#818cf8', win_probability: 35 },
      { name: 'Location Review', color: '#f59e0b', win_probability: 55 },
      { name: 'Investment Review', color: '#fb7185', win_probability: 75 },
      { name: 'Closed Won', color: '#10b981', is_closed: true, win_probability: 100 },
      { name: 'Closed Lost', color: '#ef4444', is_closed: true, win_probability: 0 },
    ],
    sources: [
      { name: 'Website Form', source_type: 'inbound' },
      { name: 'Consultant Referral', source_type: 'referral' },
      { name: 'Food Expo', source_type: 'event' },
      { name: 'Outbound Prospecting', source_type: 'outbound' },
    ],
    fields: [
      { field_key: 'cuisine_type', label: 'Cuisine Type', field_type: 'select', options: ['Indian', 'Italian', 'Chinese', 'Cafe', 'Cloud Kitchen'], is_required: true },
      { field_key: 'investment_budget', label: 'Investment Budget', field_type: 'number', placeholder: '500000' },
      { field_key: 'target_area', label: 'Target Area', field_type: 'text', placeholder: 'City / neighborhood', is_required: true },
      { field_key: 'seating_capacity', label: 'Seating Capacity', field_type: 'number', placeholder: '80' },
      { field_key: 'franchise_interest', label: 'Franchise Model', field_type: 'boolean', default_value: false, help_text: 'Does the lead want a franchise-backed setup?' },
      { field_key: 'launch_target_date', label: 'Target Launch Date', field_type: 'date' },
    ],
  },
  'gas-station': {
    pipelineName: 'Station Operations Pipeline',
    stages: [
      { name: 'New Contact', color: '#38bdf8', win_probability: 5 },
      { name: 'Qualified', color: '#60a5fa', win_probability: 20 },
      { name: 'Needs Assessment', color: '#818cf8', win_probability: 40 },
      { name: 'Vendor Review', color: '#f59e0b', win_probability: 60 },
      { name: 'Operational Approval', color: '#10b981', is_closed: true, win_probability: 100 },
      { name: 'Dormant', color: '#ef4444', is_closed: true, win_probability: 0 },
    ],
    sources: [
      { name: 'Supplier Referral', source_type: 'referral' },
      { name: 'Field Visit', source_type: 'offline' },
      { name: 'Industry Directory', source_type: 'directory' },
      { name: 'Inbound Call', source_type: 'inbound' },
    ],
    fields: [
      { field_key: 'station_type', label: 'Station Type', field_type: 'select', options: ['Retail', 'Highway', 'Fleet', 'Mixed Use'], is_required: true },
      { field_key: 'monthly_volume', label: 'Monthly Volume', field_type: 'number', placeholder: '120000', help_text: 'Approximate monthly liters or gallons sold.' },
      { field_key: 'fuel_brand', label: 'Fuel Brand', field_type: 'text', placeholder: 'Brand / independent' },
      { field_key: 'service_needs', label: 'Service Needs', field_type: 'multi_select', options: ['Maintenance', 'Supply', 'POS Upgrade', 'Compliance'], is_required: true },
      { field_key: 'twenty_four_seven_operation', label: '24/7 Operation', field_type: 'boolean', default_value: false },
      { field_key: 'contract_renewal_date', label: 'Renewal Date', field_type: 'date' },
    ],
  },
  'convenience-store': {
    pipelineName: 'Store Growth Pipeline',
    stages: [
      { name: 'New Lead', color: '#38bdf8', win_probability: 5 },
      { name: 'Qualified', color: '#60a5fa', win_probability: 20 },
      { name: 'Store Review', color: '#818cf8', win_probability: 40 },
      { name: 'Commercial Proposal', color: '#f59e0b', win_probability: 60 },
      { name: 'Activated', color: '#10b981', is_closed: true, win_probability: 100 },
      { name: 'Lost', color: '#ef4444', is_closed: true, win_probability: 0 },
    ],
    sources: [
      { name: 'Distributor Referral', source_type: 'referral' },
      { name: 'Field Survey', source_type: 'offline' },
      { name: 'Marketplace Inquiry', source_type: 'marketplace' },
      { name: 'Website Form', source_type: 'inbound' },
    ],
    fields: [
      { field_key: 'store_format', label: 'Store Format', field_type: 'select', options: ['Neighborhood', 'Fuel Attached', 'Mini Mart', 'Campus'], is_required: true },
      { field_key: 'store_size_sqft', label: 'Store Size (sq ft)', field_type: 'number', placeholder: '1500' },
      { field_key: 'primary_category', label: 'Primary Category', field_type: 'select', options: ['Groceries', 'Snacks', 'Beverages', 'Mixed'], is_required: true },
      { field_key: 'operating_hours', label: 'Operating Hours', field_type: 'text', placeholder: '24/7 or 8am-11pm' },
      { field_key: 'cold_storage_needed', label: 'Needs Cold Storage', field_type: 'boolean', default_value: false },
      { field_key: 'store_relaunch_date', label: 'Relaunch Target Date', field_type: 'date' },
    ],
  },
  'auto-repair': {
    pipelineName: 'Service Intake Pipeline',
    stages: [
      { name: 'New Inquiry', color: '#38bdf8', win_probability: 5 },
      { name: 'Vehicle Diagnosed', color: '#60a5fa', win_probability: 25 },
      { name: 'Estimate Shared', color: '#818cf8', win_probability: 45 },
      { name: 'Work Approved', color: '#f59e0b', win_probability: 75 },
      { name: 'Completed', color: '#10b981', is_closed: true, win_probability: 100 },
      { name: 'Declined', color: '#ef4444', is_closed: true, win_probability: 0 },
    ],
    sources: [
      { name: 'Repeat Customer', source_type: 'retention' },
      { name: 'Google Profile', source_type: 'inbound' },
      { name: 'Walk In', source_type: 'offline' },
      { name: 'Insurance Referral', source_type: 'referral' },
    ],
    fields: [
      { field_key: 'vehicle_make', label: 'Vehicle Make', field_type: 'text', placeholder: 'Toyota', is_required: true },
      { field_key: 'vehicle_model', label: 'Vehicle Model', field_type: 'text', placeholder: 'Corolla', is_required: true },
      { field_key: 'registration_number', label: 'Registration Number', field_type: 'text', placeholder: 'AB12CD3456' },
      { field_key: 'service_type', label: 'Service Type', field_type: 'multi_select', options: ['Diagnostics', 'Brake Repair', 'Oil Change', 'Body Work'], is_required: true },
      { field_key: 'insurance_claim', label: 'Insurance Claim', field_type: 'boolean', default_value: false },
      { field_key: 'promised_pickup_date', label: 'Promised Pickup Date', field_type: 'date' },
    ],
  },
};

export function getTemplateForCrmType(crmType: CRMType) {
  return crmTemplates[crmType];
}
