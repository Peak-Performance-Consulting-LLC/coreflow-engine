# Complete Email Automation System - Implementation Guide

## Overview

This guide explains the complete professional email automation system with brand customization, template design, automation sequences, and campaign management.

## System Architecture

### 1. **Brand Customization** (Foundation)
- Set company logo, colors, fonts
- Define sender information
- Configure email footer
- All templates inherit brand settings

### 2. **Email Template Builder** (Design)
- Drag-and-drop visual builder
- Professional block types:
  - Header (company info)
  - Hero (main image/headline)
  - Text content
  - Image blocks
  - Call-to-action buttons
  - Dividers
  - Footer
- Template variables for dynamic content

### 3. **Email Automation Sequences** (Triggers)
- **Trigger Types**:
  - `lead_created`: Send when new lead registered
  - `stage_change`: Send when lead moves to stage
  - `tag_added`: Send when specific tag applied
  - `manual_trigger`: Send manually on demand

- **Sequence Steps**:
  - Multiple emails in sequence
  - Configurable delay between emails
  - Conditions per step
  - Proper ordering

- **Templates**:
  - Welcome (first email on lead creation)
  - Follow-ups (nurture sequences)
  - Reminders (gentle check-ins)
  - Feedback Requests (after purchase/interaction)
  - Offers & Promotions (special deals)

### 4. **Email Campaigns** (Execution)
- Create campaigns with templates
- Select recipients using filters:
  - By lead stage
  - By lead source
  - By tags
  - Manual include/exclude
- Scheduling options:
  - Send immediately
  - Schedule for specific time
  - Recurring campaigns
  - Respects send windows (avoid nights/weekends)
- Timezone awareness

### 5. **Delivery & Tracking**
- Campaign recipient snapshots (immutable)
- Unsubscribe management
- Email suppression (respects opt-outs)
- Event tracking (opens, clicks, bounces)
- Delivery status per recipient
- Campaign statistics

## User Workflows

### Workflow 1: Create Professional Welcome Email

1. **Go to Email Settings > Brand**
   - Upload company logo
   - Set primary color (brand color)
   - Configure footer (company name, address, email)
   - Set default sender name and email

2. **Create Template**
   - Go to Templates tab
   - Click "New Template"
   - Choose "Welcome" category
   - Name: "Professional Welcome Email"
   - Use Template Builder:
     - Add Header block → Choose company info
     - Add Hero block → Upload company image
     - Add Text block → Write welcome message
     - Add CTA block → Create "Get Started" button
     - Add Footer block → System automatically adds footer
   - Variables available:
     - {{lead_first_name}}
     - {{lead_email}}
     - {{lead_company}}
     - {{workspace_name}}

3. **Preview**
   - See how email looks on desktop/mobile
   - Check all variables populated correctly

### Workflow 2: Set Up Automatic Welcome Email

1. **Create Automation Sequence**
   - Go to Automations tab
   - Click "New Automation"
   - Name: "Automatic Welcome for New Leads"
   - Trigger: Select "Lead Created"
   - Add Step 1: Welcome Email (delay: 0 hours)
   - Add Step 2: Follow-up Email (delay: 24 hours)
   - Add Step 3: Second Follow-up (delay: 72 hours)
   - Save & Activate

2. **Test**
   - Create new lead in CRM
   - Welcome email automatically sends
   - Check email received in inbox

### Workflow 3: Send Campaign to Segment

1. **Create Campaign**
   - Go to Campaigns tab
   - Click "Send Campaign"
   - Step 1: Choose Template
     - Name: "Spring Offer Campaign"
     - Select: "Special Offer" template
   - Step 2: Select Recipients
     - Filter by Stage: "Prospects"
     - Filter by Tag: "Interested"
     - Estimate: 245 recipients
   - Step 3: Schedule
     - Choose: "Send Now"
     - Or schedule for specific date/time
   - Send Campaign

2. **Track Results**
   - View campaign stats
   - See delivery status per recipient
   - Track opens and clicks
   - Monitor unsubscribes

## Database Tables

### Core Tables

```sql
workspace_email_brand_themes
├─ Stores brand customization per workspace
├─ Logo, colors, fonts, footer info
└─ Used by all templates

email_templates
├─ Professional templates with layout_json
├─ Contains visual blocks (header, hero, text, cta, etc.)
├─ Supports brand customization
└─ Tracks usage and clones

email_template_categories
├─ Welcome, Follow-ups, Reminder, Feedback, Offers
└─ Organize templates

email_campaigns
├─ Campaign configuration
├─ Recipient filters/segments
├─ Schedule and status
└─ Reference to template

email_campaign_recipient_snapshots
├─ Frozen list of recipients at send time
├─ Immutable record of who received email
└─ Prevents duplicate sends

email_campaign_recipients
├─ Individual recipient tracking
├─ Delivery status (pending, sent, failed, bounced, opened, clicked)
├─ Suppression reasons
└─ Provider message IDs

email_send_events
├─ All email events (sent, opened, clicked, bounced)
├─ Tracks provider responses
└─ Enables analytics

workspace_email_unsubscribes
├─ Opt-out management
├─ Can be resubscribed
└─ Prevents sending to unsubscribed emails

record_email_followups
├─ Automation sequence definitions
├─ Trigger configuration
└─ Multi-step sequences

record_email_followup_steps
├─ Individual steps in sequence
├─ Template assignment per step
└─ Delay configuration
```

## API Endpoints (Edge Functions)

### Template Operations
- `POST /functions/v1/email-template-create` - Create template
- `PUT /functions/v1/email-template-update` - Update template
- `DELETE /functions/v1/email-template-delete` - Delete template

### Campaign Operations
- `POST /functions/v1/email-campaign-create` - Create campaign
- `POST /functions/v1/email-campaign-enumerate-recipients` - Find recipients
- `POST /functions/v1/email-campaign-send-batch` - Send emails
- `GET /functions/v1/email-campaign-stats` - Get campaign stats

### Automation
- `POST /functions/v1/email-automation-create` - Create sequence
- `POST /functions/v1/email-automation-trigger` - Trigger automation
- `POST /functions/v1/email-followup-dispatch` - Send follow-up step

## Template Variables Reference

### Lead/Record Variables
```
{{lead_first_name}}     - First name of lead
{{lead_last_name}}      - Last name of lead  
{{lead_email}}          - Email address
{{lead_phone}}          - Phone number
{{lead_company}}        - Company name
{{lead_title}}          - Job title
{{lead_stage}}          - Current CRM stage
{{lead_source}}         - Lead source
{{lead_tags}}           - Associated tags
{{lead_created_at}}     - When lead was created
```

### Workspace Variables
```
{{workspace_name}}      - Your workspace/company name
{{sender_name}}         - Default sender display name
{{sender_email}}        - Default sender email
{{workspace_url}}       - Your workspace URL
```

### Dynamic CTAs
```
{{cta_url}}             - Dynamic call-to-action URL
{{unsubscribe_link}}    - Unsubscribe link (required by law)
{{preference_center}}   - Email preference center
```

## Automation Trigger Events

### Lead Created
- Fires when new lead is added to workspace
- Can be used for welcome sequences
- Delay first email by 0-24 hours

### Stage Changed
- Fires when lead moves to specific stage
- Different sequences per stage
- Example: Send "we're interested" email when moved to "Qualified" stage

### Tag Added
- Fires when specific tag is applied
- Examples:
  - Tag "vip" → Send VIP welcome email
  - Tag "purchased" → Send thank you email
  - Tag "interested_product_x" → Send product info

### Manual Trigger
- Admin manually triggers automation
- Useful for special promotions
- Send to specific segment on demand

## Scheduling Features

### Send Windows
- Avoid sending during off-hours
- Configure per workspace:
  - Start hour (e.g., 9 AM)
  - End hour (e.g., 5 PM)
  - Days (exclude weekends if desired)
- Timezone: UTC → user's local time

### Recurring Campaigns
- Daily: Send same email every day to new leads
- Weekly: Weekly newsletter to segment
- Monthly: Monthly updates
- Custom: Custom recurrence rules

## Best Practices

### Email Template Design
1. **Keep it Simple**
   - 2-3 main sections
   - Clear hierarchy
   - One main CTA button

2. **Mobile Responsive**
   - Test on mobile view
   - Keep images scaled down
   - Use readable fonts

3. **Brand Consistent**
   - Use brand colors
   - Include logo
   - Consistent footer

### Campaign Strategy
1. **Segment Properly**
   - Don't spam everyone
   - Targeted sends get better results
   - Use lead stage and tags

2. **Timing Matters**
   - Test different send times
   - Respect timezones
   - Avoid weekends/nights

3. **Follow-Up Sequences**
   - First email: Day 0
   - Second email: Day 1
   - Third email: Day 3
   - Wait between sends for better engagement

### Compliance
1. **Always Include Unsubscribe**
   - Required by law (CAN-SPAM, GDPR)
   - System automatically adds: {{unsubscribe_link}}
   - Respect opt-outs immediately

2. **Honest Subject Lines**
   - Avoid spam trigger words
   - Don't mislead about content
   - Be clear about what you're sending

3. **Audit Trail**
   - System tracks all sends
   - Know who received what and when
   - Review bounce/complaint reasons

## Troubleshooting

### Emails Not Sending
- Check email provider configured in Email Settings
- Verify sender email is authorized
- Check recipient email is not unsubscribed
- Review campaign recipient count (ensure > 0)

### Low Open Rates
- Check subject line - too generic?
- Test different send times
- Segment audience better
- Update template design

### Bounces/Failed Sends
- Check recipient email validity
- Remove bounced emails from future campaigns
- Review suppression list
- Check email provider logs

### Formatting Issues
- Test email in different clients
- Check HTML is valid
- Verify images load correctly
- Use web-safe fonts

## Security & Privacy

### Data Protection
- All emails encrypted in transit
- Recipient list snapshots (immutable)
- Audit logs of all sends
- GDPR-compliant unsubscribe handling

### Authentication
- Only workspace admins can create/send campaigns
- All sends tied to user account
- Email provider credentials never logged
- Support for multiple senders per workspace

## Next Steps

1. **Go to Email Settings**
   - Configure brand customization
   - Upload logo and set colors

2. **Create Your First Template**
   - Use Professional Email Designer
   - Start with Welcome template
   - Preview before saving

3. **Set Up Automation**
   - Create "Lead Created" automation
   - Add welcome email sequence
   - Test with new lead

4. **Send Your First Campaign**
   - Create manual campaign
   - Select small recipient segment
   - Review before sending
   - Monitor delivery and engagement

5. **Optimize Based on Results**
   - Review campaign stats
   - Adjust subject lines/CTAs
   - Test different templates
   - Build winning sequences
