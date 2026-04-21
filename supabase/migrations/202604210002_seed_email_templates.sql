-- Pre-made Email Templates Library - Simplified
-- This seeds basic email templates that users can clone and customize

-- Insert Template Categories
insert into public.email_template_categories (workspace_id, name, slug, description, icon, color, sort_order)
select id, 'Welcome', 'welcome', 'Greet new leads and introduce your business', '👋', '#10B981', 1 from public.workspaces
where not exists (select 1 from public.email_template_categories where workspace_id = public.workspaces.id and slug = 'welcome');

insert into public.email_template_categories (workspace_id, name, slug, description, icon, color, sort_order)
select id, 'Follow-ups', 'followups', 'Keep leads engaged with strategic follow-up sequences', '📬', '#F59E0B', 2 from public.workspaces
where not exists (select 1 from public.email_template_categories where workspace_id = public.workspaces.id and slug = 'followups');

insert into public.email_template_categories (workspace_id, name, slug, description, icon, color, sort_order)
select id, 'Re-engagement', 'reengagement', 'Win back inactive leads', '🔄', '#8B5CF6', 3 from public.workspaces
where not exists (select 1 from public.email_template_categories where workspace_id = public.workspaces.id and slug = 'reengagement');

insert into public.email_template_categories (workspace_id, name, slug, description, icon, color, sort_order)
select id, 'Offers & Promotions', 'offers', 'Present special offers and limited-time deals', '🎁', '#EC4899', 4 from public.workspaces
where not exists (select 1 from public.email_template_categories where workspace_id = public.workspaces.id and slug = 'offers');

insert into public.email_template_categories (workspace_id, name, slug, description, icon, color, sort_order)
select id, 'Feedback & Survey', 'feedback', 'Gather feedback and insights from leads', '💬', '#06B6D4', 5 from public.workspaces
where not exists (select 1 from public.email_template_categories where workspace_id = public.workspaces.id and slug = 'feedback');

-- Basic Welcome Template
insert into public.email_templates (workspace_id, category_id, name, slug, description, subject_template, body_html_template, body_plain_template, is_html, template_type, use_case, is_active, is_locked, include_footer, tags, metadata)
select w.id, (select id from public.email_template_categories where workspace_id = w.id and slug = 'welcome'),
  'Welcome', 'welcome', 'Basic welcome template',
  'Welcome to {{workspace_name}}!',
  '<p>Hi {{lead_first_name}},</p><p>Welcome to {{workspace_name}}! We are excited to have you on board.</p>',
  'Hi {{lead_first_name}}, Welcome to {{workspace_name}}! We are excited to have you on board.',
  true, 'preset', 'welcome', true, true, true, array['welcome'], NULL::jsonb
from public.workspaces w
where not exists (select 1 from public.email_templates where workspace_id = w.id and slug = 'welcome');

-- Basic Follow-up Template
insert into public.email_templates (workspace_id, category_id, name, slug, description, subject_template, body_html_template, body_plain_template, is_html, template_type, use_case, is_active, is_locked, include_footer, tags, metadata)
select w.id, (select id from public.email_template_categories where workspace_id = w.id and slug = 'followups'),
  'Follow-up', 'followup', 'Basic follow-up template',
  'Following up - {{lead_first_name}}',
  '<p>Hi {{lead_first_name}},</p><p>Just wanted to check in and see if you have any questions.</p>',
  'Hi {{lead_first_name}}, Just wanted to check in and see if you have any questions.',
  true, 'preset', 'followup', true, true, true, array['followup'], NULL::jsonb
from public.workspaces w
where not exists (select 1 from public.email_templates where workspace_id = w.id and slug = 'followup');

-- Basic Re-engagement Template
insert into public.email_templates (workspace_id, category_id, name, slug, description, subject_template, body_html_template, body_plain_template, is_html, template_type, use_case, is_active, is_locked, include_footer, tags, metadata)
select w.id, (select id from public.email_template_categories where workspace_id = w.id and slug = 'reengagement'),
  'We Miss You', 'we-miss-you', 'Re-engagement template',
  'We miss you, {{lead_first_name}}!',
  '<p>Hi {{lead_first_name}},</p><p>We have missed you! Check out what is new with us.</p>',
  'Hi {{lead_first_name}}, We have missed you! Check out what is new with us.',
  true, 'preset', 're-engagement', true, true, true, array['reengagement'], NULL::jsonb
from public.workspaces w
where not exists (select 1 from public.email_templates where workspace_id = w.id and slug = 'we-miss-you');

-- Basic Feedback Template
insert into public.email_templates (workspace_id, category_id, name, slug, description, subject_template, body_html_template, body_plain_template, is_html, template_type, use_case, is_active, is_locked, include_footer, tags, metadata)
select w.id, (select id from public.email_template_categories where workspace_id = w.id and slug = 'feedback'),
  'Feedback Request', 'feedback-request', 'Feedback request template',
  'Your feedback matters - {{lead_first_name}}',
  '<p>Hi {{lead_first_name}},</p><p>We would love to hear your feedback about your experience with us.</p>',
  'Hi {{lead_first_name}}, We would love to hear your feedback about your experience with us.',
  true, 'preset', 'feedback', true, true, true, array['feedback'], NULL::jsonb
from public.workspaces w
where not exists (select 1 from public.email_templates where workspace_id = w.id and slug = 'feedback-request');
