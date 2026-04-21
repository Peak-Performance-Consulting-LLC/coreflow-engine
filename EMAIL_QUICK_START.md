# Email Automation System - Quick Start Guide

## Access the System

### From Dashboard
1. Navigate to your CoreFlow dashboard at `http://localhost:5175/`
2. Click on **Email** in the navigation menu
3. Click the **"Templates & Campaigns"** button (purple button with sparkles)

### Direct Link
Visit: `http://localhost:5175/email/templates`

---

## What You Can Do

### 1. 📧 Design Professional Emails
**Location**: Templates & Campaigns > Templates tab

- Drag-and-drop visual builder
- 7 professional block types:
  - Header (company info)
  - Hero section (main image)
  - Text content
  - Images
  - Call-to-action buttons
  - Dividers
  - Footer

- Features:
  - Real-time preview
  - Brand customization
  - Template variables ({{lead_first_name}}, {{workspace_name}}, etc.)
  - Save and reuse templates

### 2. 🤖 Automate Email Sequences
**Location**: Templates & Campaigns > Automations tab

**Trigger Types**:
- **Lead Created** - Send automatic welcome email
- **Stage Changed** - Trigger when lead moves to specific stage
- **Tag Added** - Send email when tag applied
- **Manual** - Send on demand

**Sequences**:
- Create multi-step email sequences
- Configure delays between emails (0, 24, 72+ hours)
- Pre-built templates: Welcome, Follow-ups, Reminders, Feedback, Offers

### 3. 📨 Send Campaigns
**Location**: Templates & Campaigns > Campaigns tab

- Create campaigns in 3 easy steps:
  1. Choose template
  2. Select recipients (by stage, source, tags)
  3. Schedule or send

- Send Options:
  - Send immediately
  - Schedule for specific time
  - Recurring (daily, weekly, monthly)
  - Timezone-aware

### 4. 🎨 Customize Your Brand
**Location**: Email Settings > Brand customization

- Upload company logo
- Set brand colors (primary, secondary, accent)
- Configure email footer
- Set default sender name and email
- Font selection

---

## Common Tasks

### Send a Welcome Email Automatically

1. **Set Up Brand**
   - Go to Email Settings
   - Upload your logo
   - Choose brand colors
   - Configure footer

2. **Create Welcome Template**
   - Go to Templates tab
   - Click "New Template"
   - Select "Welcome" category
   - Use visual builder:
     - Add Header
     - Add Hero image
     - Add Text: "Welcome to our company"
     - Add CTA button: "Get Started"
     - Add Footer
   - Save

3. **Create Automation**
   - Go to Automations tab
   - Click "New Automation"
   - Name: "Welcome New Leads"
   - Trigger: "Lead Created"
   - Add Step 1: Welcome template (delay: 0 hours)
   - Save & Activate

4. **Test**
   - Create a new test lead in your CRM
   - Welcome email automatically sends

### Send Campaign to Prospects

1. **Create Campaign**
   - Go to Campaigns tab
   - Click "Send Campaign"
   - Choose your template
   - Filter recipients by:
     - Stage: "Prospects"
     - Tags: "Interested"
   - See recipient count estimate
   - Schedule or send immediately
   - Click "Send Campaign"

2. **Track Results**
   - View campaign stats
   - See delivery status
   - Monitor open/click rates

### Personalize Email Content

Use template variables in your emails:

```
Hello {{lead_first_name}},

Welcome to {{workspace_name}}. 

We're excited to help {{lead_company}} achieve their goals.

Best regards,
{{sender_name}}
```

---

## Template Variables Available

### Lead/Record Data
```
{{lead_first_name}}    Lead's first name
{{lead_last_name}}     Lead's last name
{{lead_email}}         Lead's email
{{lead_company}}       Lead's company
{{lead_title}}         Lead's job title
{{lead_phone}}         Lead's phone
{{lead_stage}}         CRM stage
{{lead_source}}        Lead source
```

### Your Workspace
```
{{workspace_name}}     Your company name
{{sender_name}}        Default sender name
{{sender_email}}       Default sender email
```

### Dynamic Links
```
{{unsubscribe_link}}   Required unsubscribe link
{{cta_url}}            Call-to-action URL
```

---

## Best Practices

### Email Design
✅ Keep emails concise (2-3 sections max)
✅ Use clear visual hierarchy
✅ Include one main call-to-action
✅ Test on mobile view
✅ Use brand colors consistently

❌ Avoid spam trigger words
❌ Don't overload with images
❌ Don't forget unsubscribe link

### Segmentation
✅ Target by lead stage
✅ Use tags for better targeting
✅ Start with small test segments
✅ Monitor engagement metrics

❌ Send to everyone at once
❌ Use generic subject lines
❌ Ignore engagement metrics

### Automation
✅ Space emails 24-72 hours apart
✅ Start with welcome sequence
✅ Use clear triggers
✅ Monitor automation performance

❌ Send too many emails
❌ Use vague subject lines
❌ Ignore bounce/complaint rates

---

## Compliance

✅ **Always include unsubscribe link** ({{unsubscribe_link}})
✅ **Respect opt-outs** (system handles automatically)
✅ **Be honest about content** (subject line matches email)
✅ **Include sender info** (name and email address)
✅ **Monitor deliverability** (check bounce rates)

CAN-SPAM and GDPR compliant ✓

---

## Troubleshooting

### Emails Not Sending?
- Check email provider is configured
- Verify sender email is valid
- Check recipient isn't unsubscribed
- Ensure campaign has recipients

### Low Open Rates?
- Test different subject lines
- Try different send times
- Improve email design
- Segment audience better

### Bounces?
- Remove bounced emails from future campaigns
- Check email validity
- Review provider error messages

### Mobile Rendering Issues?
- Use mobile preview
- Check image sizes
- Use readable fonts
- Test in different clients

---

## Next Steps

1. **Configure Your Brand** (5 min)
   - Go to Email Settings
   - Upload logo
   - Set colors and footer

2. **Create First Template** (10 min)
   - Go to Templates tab
   - Design welcome email
   - Add personalization

3. **Set Up Automation** (5 min)
   - Go to Automations tab
   - Create welcome automation
   - Test with new lead

4. **Send Campaign** (5 min)
   - Go to Campaigns tab
   - Create first campaign
   - Monitor delivery

---

## Support

📖 **Full Documentation**: See `EMAIL_AUTOMATION_COMPLETE_GUIDE.md`

For technical details on:
- Database schema
- API endpoints
- Advanced features
- Architecture overview

---

## Key Features

✅ Visual email template builder
✅ Professional email design
✅ Email automation sequences
✅ Advanced campaign management
✅ Brand customization
✅ Recipient segmentation
✅ Schedule emails
✅ Track delivery
✅ Compliance built-in
✅ Multi-workspace support

---

**Ready to send professional emails?** Start with your brand settings! 🚀
