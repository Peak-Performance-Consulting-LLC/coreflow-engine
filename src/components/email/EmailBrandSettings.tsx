import { useState } from 'react';
import { Save, Palette } from 'lucide-react';
import { toast } from 'sonner';
import type { EmailBrandTheme } from '../../lib/email-template-service';

interface EmailBrandSettingsProps {
  theme: EmailBrandTheme | null;
  onSave: (theme: EmailBrandTheme) => Promise<void>;
}

export function EmailBrandSettings({ theme: initialTheme, onSave }: EmailBrandSettingsProps) {
  const [theme, setTheme] = useState<EmailBrandTheme>(
    initialTheme || {
      brand_name: '',
      logo_url: '',
      primary_color: '#6D28D9',
      secondary_color: '#F59E0B',
      accent_color: '#EC4899',
      body_bg_color: '#FFFFFF',
      card_bg_color: '#F8F9FA',
      text_color: '#333333',
      heading_font: 'Arial, sans-serif',
      body_font: 'Arial, sans-serif',
      footer_company_name: '',
      footer_address: '',
      footer_contact_email: '',
      footer_signature: '',
      sender_display_name_default: '',
      sender_email_default: '',
    }
  );

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(theme);
      toast.success('Brand settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5" />
          Email Brand Customization
        </h3>
        <p className="text-sm text-slate-600">
          Customize how your emails look and feel. These settings apply to all your email templates.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Logo & Company */}
        <div className="col-span-2 lg:col-span-1 space-y-4">
          <h4 className="font-semibold text-slate-900">Company Information</h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Brand Name</label>
            <input
              type="text"
              value={theme.brand_name || ''}
              onChange={e => setTheme({ ...theme, brand_name: e.target.value })}
              placeholder="Your Company Name"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL</label>
            <input
              type="url"
              value={theme.logo_url || ''}
              onChange={e => setTheme({ ...theme, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {theme.logo_url && (
              <div className="mt-3 p-4 bg-slate-50 rounded-lg flex items-center justify-center">
                <img
                  src={theme.logo_url}
                  alt="Brand Logo"
                  className="h-16 object-contain"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Sender Name
            </label>
            <input
              type="text"
              value={theme.sender_display_name_default || ''}
              onChange={e => setTheme({ ...theme, sender_display_name_default: e.target.value })}
              placeholder="e.g., Support Team"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Sender Email
            </label>
            <input
              type="email"
              value={theme.sender_email_default || ''}
              onChange={e => setTheme({ ...theme, sender_email_default: e.target.value })}
              placeholder="support@example.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Colors */}
        <div className="col-span-2 lg:col-span-1 space-y-4">
          <h4 className="font-semibold text-slate-900">Brand Colors</h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Primary Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={theme.primary_color || '#6D28D9'}
                onChange={e => setTheme({ ...theme, primary_color: e.target.value })}
                className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={theme.primary_color || '#6D28D9'}
                onChange={e => setTheme({ ...theme, primary_color: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Secondary Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={theme.secondary_color || '#F59E0B'}
                onChange={e => setTheme({ ...theme, secondary_color: e.target.value })}
                className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={theme.secondary_color || '#F59E0B'}
                onChange={e => setTheme({ ...theme, secondary_color: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Accent Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={theme.accent_color || '#EC4899'}
                onChange={e => setTheme({ ...theme, accent_color: e.target.value })}
                className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={theme.accent_color || '#EC4899'}
                onChange={e => setTheme({ ...theme, accent_color: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Background Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={theme.body_bg_color || '#FFFFFF'}
                onChange={e => setTheme({ ...theme, body_bg_color: e.target.value })}
                className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
              />
              <input
                type="text"
                value={theme.body_bg_color || '#FFFFFF'}
                onChange={e => setTheme({ ...theme, body_bg_color: e.target.value })}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="col-span-2 space-y-4">
          <h4 className="font-semibold text-slate-900">Email Footer</h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
              <input
                type="text"
                value={theme.footer_company_name || ''}
                onChange={e => setTheme({ ...theme, footer_company_name: e.target.value })}
                placeholder="Company Name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
              <input
                type="email"
                value={theme.footer_contact_email || ''}
                onChange={e => setTheme({ ...theme, footer_contact_email: e.target.value })}
                placeholder="contact@example.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
            <textarea
              value={theme.footer_address || ''}
              onChange={e => setTheme({ ...theme, footer_address: e.target.value })}
              placeholder="Your company address"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Footer Signature</label>
            <textarea
              value={theme.footer_signature || ''}
              onChange={e => setTheme({ ...theme, footer_signature: e.target.value })}
              placeholder="e.g., Best regards, Your Company"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <h4 className="font-semibold text-slate-900">Preview</h4>
        <div
          className="p-6 rounded-lg text-white"
          style={{
            backgroundColor: theme.primary_color || '#6D28D9',
          }}
        >
          <div className="text-2xl font-bold mb-2">{theme.brand_name || 'Your Brand'}</div>
          <div className="text-sm opacity-90">
            This is how your emails will look with these settings
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Brand Settings'}
        </button>
      </div>
    </div>
  );
}
