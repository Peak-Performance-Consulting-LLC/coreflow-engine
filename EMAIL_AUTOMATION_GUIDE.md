# Email Automation Intelligence System - Implementation Guide

## 📋 Overview

This comprehensive email automation system provides end-to-end email template customization, campaign management, and intelligent scheduling. Users can now:

- **Design Email Templates** with HTML/Rich Text Editor and custom branding
- **Upload Logos & Assets** for personalized emails
- **Create Email Campaigns** with recipient filtering
- **Schedule Emails** with intelligent timing and send windows
- **Use Pre-made Templates** for quick campaign setup (Welcome, Follow-ups, Re-engagement, Offers, Feedback)
- **Track Campaign Performance** with detailed statistics
- **Manage Attachments** dynamically per campaign

---

## 🏗️ Architecture Overview

### Database Schema

#### Core Tables
1. **email_template_categories** - Template classification (Welcome, Follow-ups, etc.)
2. **email_templates** - Custom and pre-made email templates with HTML/Plain text support
3. **email_template_assets** - Logos, images, documents stored in Supabase Storage
4. **email_campaigns** - Campaign configurations with recipient filters
5. **email_campaign_recipients** - Individual campaign recipient tracking
6. **email_campaign_template_attachments** - Dynamic attachment management per campaign
7. **email_campaign_stats** - Aggregated campaign performance metrics

### File Structure

```
src/
├── lib/
│   ├── email-template-service.ts    # Service layer for templates, campaigns, assets
│   └── email-service.ts              # Existing email provider configuration
├── pages/
│   └── EmailTemplatesPage.tsx        # Complete UI for templates, campaigns, assets tabs
supabase/
├── migrations/
│   ├── 202604210001_email_templates_campaigns_enhancement.sql
│   └── 202604210002_seed_email_templates.sql
└── functions/
    ├── email-campaign-enumerate-recipients/
    ├── email-campaign-send-batch/
    └── email-campaign-template-options/
```

---

## 🚀 Key Features

### 1. Template Builder

**Rich HTML Editor**
- WYSIWYG formatting toolbar (Bold, Italic, Underline, Lists, Links)
- Syntax highlighting for HTML code
- Real-time preview rendering
- Plain text fallback support

**Template Variables** (Auto-personalization)
```
{{lead_full_name}}      # "John Smith"
{{lead_first_name}}     # "John"
{{lead_email}}          # "john@example.com"
{{workspace_name}}      # "Acme Corp"
{{sender_name}}         # "Jane Doe"
{{sender_email}}        # "jane@acme.com"
```

**Template Types**
- `preset` - Read-only system templates (Welcome, Follow-ups, etc.)
- `custom` - User-created templates (fully editable)
- `system` - Internal templates (locked, not visible to users)

### 2. Pre-made Template Library

5 Built-in Categories:

| Category | Templates | Use Case |
|----------|-----------|----------|
| Welcome | Classic Welcome | First touchpoint with leads |
| Follow-ups | Quick Follow-up | Engagement after initial contact |
| Re-engagement | Win Back Campaign | Re-activate inactive leads |
| Offers | Special Offers | Promotions with discount codes |
| Feedback | Simple Feedback | Survey and feedback collection |

All pre-made templates:
- Can be cloned and customized
- Track clone counts and usage
- Include professional HTML design
- Feature proper responsive layout

### 3. Asset Management

**Upload Types**
- Images (PNG, JPG, WEBP, GIF)
- Documents (PDF, DOC, DOCX)
- General Attachments

**Features**
- 50MB file size limit
- Automatic public URL generation
- Logo tagging for template headers
- Signature support for email footers
- Usage tracking

### 4. Campaign Management

**Campaign Lifecycle**
```
Draft → Scheduled → Active → Completed/Paused/Cancelled
```

**Campaign Configuration**
```typescript
interface EmailCampaign {
  name: string;                  // Campaign name
  description?: string;          // Optional description
  template_id: string;           // Selected email template
  sender_id?: string;            // Email account to send from
  status: CampaignStatus;        // Current state
  recipient_filter?: object;     // Query to select recipients
  recipient_count: number;       // Total recipients
  scheduled_at?: datetime;       // When to start sending
  send_window_start?: number;    // Hour of day (0-23)
  send_window_end?: number;      // Hour of day (0-23)
  send_window_days?: string[];   // Days allowed (Mon,Tue,...)
  timezone: string;              // Campaign timezone
  rate_limit: number;            // Emails per minute (0=unlimited)
}
```

**Recipient Filtering**
```typescript
// Example: Send to all qualified leads from web form
const recipientFilter = {
  stage: "qualified",
  source: "web_form",
  assigned_to: "user_id_123"
};

// Applied via SQL:
// SELECT * FROM crm_records
// WHERE stage='qualified' AND source='web_form' AND assigned_to='user_id_123'
```

### 5. Scheduling & Send Windows

**Intelligent Scheduling**
- Configure specific hours for sending (8am-6pm)
- Restrict sending to business days (Mon-Fri)
- Timezone-aware scheduling
- Rate limiting per minute
- Batch processing support

**Send Window Example**
```typescript
{
  send_window_start: 8,          // Start at 8:00 AM
  send_window_end: 18,           // Stop at 6:00 PM
  send_window_days: ['Mon','Tue','Wed','Thu','Fri'],
  timezone: 'America/New_York',
  rate_limit: 60                 // Max 60 emails/minute
}
```

---

## 📖 Usage Guide

### Creating a Template

```typescript
import { createTemplate } from '@/lib/email-template-service';

const template = await createTemplate(workspaceId, {
  name: 'Welcome Series Email 1',
  subject_template: 'Welcome to {{workspace_name}}, {{lead_first_name}}!',
  body_html_template: '<h1>Welcome!</h1><p>Hi {{lead_first_name}},...</p>',
  is_html: true,
  include_footer: true,
  template_type: 'custom',
});
```

### Uploading an Asset

```typescript
import { uploadAsset } from '@/lib/email-template-service';

const file = new File(['...'], 'logo.png', { type: 'image/png' });
const asset = await uploadAsset(workspaceId, file, 'image', true);

// Use in template: <img src="${asset.public_url}" alt="Logo" />
```

### Creating a Campaign

```typescript
import { createCampaign, fetchCampaignStats } from '@/lib/email-template-service';

const campaign = await createCampaign(workspaceId, {
  name: 'Q1 2026 Welcome Series',
  template_id: templateId,
  sender_id: senderAccountId,
  recipient_filter: { stage: 'new', source: 'form' },
  timezone: 'America/New_York',
  send_window_start: 9,
  send_window_end: 17,
  send_window_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
});

// Monitor campaign
const stats = await fetchCampaignStats(campaign.id);
// Returns: { sent_count, failed_count, open_count, click_count, ... }
```

### Enumerating Recipients

```typescript
// Call the Supabase function to populate recipients
const response = await supabase.functions.invoke('email-campaign-enumerate-recipients', {
  body: {
    campaign_id: campaignId,
    workspace_id: workspaceId,
    record_filter: { stage: 'qualified' }
  }
});
```

### Sending Campaign Batch

```typescript
// Send emails in batches of 10
const result = await supabase.functions.invoke('email-campaign-send-batch', {
  body: {
    campaign_id: campaignId,
    workspace_id: workspaceId,
    batch_size: 10
  }
});
// Returns: { processed, sent, failed }
```

---

## 🔐 Security Features

### Row Level Security (RLS)

All tables have strict RLS policies:

**Templates**
- Members can view/create templates for their workspace
- Only template creators can edit custom templates
- System templates are locked and read-only
- Policies check workspace membership

**Campaigns**
- Only workspace members can view campaigns
- Only campaign creators can edit draft/scheduled campaigns
- Service role can manage recipients for background jobs

**Assets**
- Members can view workspace assets
- Only uploaders can manage their assets
- Public URLs are generated via Supabase Storage

### Data Protection

- All OAuth tokens encrypted at rest
- SMTP passwords encrypted at rest
- Workspace isolation enforced
- Audit logging on all updates

---

## 🔄 Integration with Existing Email System

### Connecting with Email Providers

The new templates system works alongside existing email providers:

```typescript
// Get configured senders
const { senders } = await fetchAccountSettings();

// Use in campaigns
const campaign = await createCampaign(workspaceId, {
  template_id: templateId,
  sender_id: senders[0].id,  // Use connected email account
  // ...
});
```

### Email Sending

Current implementation:
1. Template + Campaign data → Edge Function
2. Function fetches recipient records
3. Renders variables into template
4. Sends via email provider
5. Logs delivery events
6. Updates campaign stats

Future enhancement: Integration with `email-enroll-lead` flow for automated sequences.

---

## 📊 Campaign Statistics

Campaign stats track:

```typescript
interface EmailCampaignStats {
  total_recipients: number;    // Total recipients enumerated
  sent_count: number;          // Successfully sent
  failed_count: number;        // Failed sends
  bounced_count: number;       // Hard bounces
  unsubscribed_count: number;  // Unsubscribe events
  open_count: number;          // Email opens (if tracked)
  click_count: number;         // Link clicks (if tracked)
  reply_count: number;         // Replies received
}
```

Access via:
```typescript
const stats = await fetchCampaignStats(campaignId);
```

---

## 🎨 UI Components Overview

### EmailTemplatesPage.tsx

Main page with 3 tabs:

**Templates Tab**
- Template library with category filtering
- Preview templates with detail panel
- Clone, edit, delete actions
- Create new template modal

**Campaigns Tab**
- List all campaigns with status
- View recipient stats
- Create campaign modal
- Campaign detail view

**Assets Tab**
- Image/document library
- Upload new assets
- Copy public URLs
- Delete assets

---

## 📱 Extending the System

### Add Custom Recipient Filters

Edit `email-campaign-enumerate-recipients` function:

```typescript
// Add support for custom field filtering
if (recordFilter.custom_field) {
  query = query.contains('custom_data', { field: recordFilter.custom_field });
}
```

### Add Email Service Integration

Create new function: `email-campaign-send-via-provider`

```typescript
// Integrate with SendGrid, Mailgun, etc.
const result = await sendViaProvider(
  campaign,
  recipients,
  senderAccount
);
```

### Add Tracking Webhooks

Create function: `email-webhook-delivery-events`

```typescript
// Handle bounce, open, click events from ESP
// Update email_delivery_events table
// Recalculate campaign_stats
```

---

## 🐛 Troubleshooting

### Templates Not Showing

**Check:**
1. Workspace ID is correct
2. Templates have `is_active = true`
3. User has workspace membership
4. RLS policies allow SELECT

### Campaign Recipients Empty

**Check:**
1. CRM records exist with `lead_email` populated
2. Record filter matches intended records
3. Recipient filter syntax is correct
4. Function has service role permissions

### Asset Upload Fails

**Check:**
1. File size < 50MB
2. Storage bucket `email-assets` exists
3. Storage bucket has proper permissions
4. MIME type is allowed

---

## 📚 Migration Steps

To deploy this system:

1. **Apply Migrations**
   ```bash
   supabase migration up
   ```

2. **Deploy Edge Functions**
   ```bash
   supabase functions deploy email-campaign-enumerate-recipients
   supabase functions deploy email-campaign-send-batch
   supabase functions deploy email-campaign-template-options
   ```

3. **Add Route to App**
   ```typescript
   import { EmailTemplatesPage } from '@/pages/EmailTemplatesPage';
   
   <Route path="/email-templates" element={<EmailTemplatesPage />} />
   ```

4. **Update Navigation**
   Add link to EmailTemplatesPage in sidebar

---

## 🎯 Next Steps

1. **Email Provider Integration** - Send actual emails via providers
2. **Tracking Webhooks** - Monitor opens, clicks, bounces
3. **A/B Testing** - Test different subject lines
4. **Template Versioning** - Track template changes
5. **Advanced Analytics** - Performance dashboards
6. **Conditional Logic** - Dynamic content blocks based on lead data
7. **Drip Campaigns** - Automated multi-email sequences
8. **Unsubscribe Management** - Compliance with CAN-SPAM

---

## 📞 Support

For issues or questions about the email automation system:
1. Check RLS policies in Supabase Console
2. Review Edge Function logs
3. Verify migration status
4. Check browser console for client errors
