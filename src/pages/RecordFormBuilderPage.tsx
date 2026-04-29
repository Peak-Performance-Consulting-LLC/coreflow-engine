import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/dashboard/PageHeader';
import { RecordForm } from '../components/records/RecordForm';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullPageLoader } from '../components/ui/FullPageLoader';
import { Input } from '../components/ui/Input';
import { useAuth } from '../hooks/useAuth';
import { useCrmWorkspace } from '../hooks/useCrmWorkspace';
import { fetchWorkspaceCustomFields, updateWorkspaceCustomFields } from '../lib/crm-service';
import type {
  CrmWorkspaceConfig,
  CustomFieldDefinition,
  CustomFieldDefinitionInput,
  CustomFieldType,
} from '../lib/crm-types';
import { isWorkspaceOwner } from '../lib/utils';

interface BuilderFieldDraft {
  localId: string;
  id?: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  group: string;
  order: number;
  is_required: boolean;
  is_active: boolean;
  is_system?: boolean;
  optionsText: string;
  placeholder: string;
  help_text: string;
  validationRulesText: string;
  defaultValueText: string;
  defaultValueBoolean: boolean;
}

const supportedFieldTypes: Array<{ value: CustomFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'select', label: 'Single select' },
  { value: 'multi_select', label: 'Multi select' },
];

function toFieldKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function createLocalId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `field-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeValidationRulesText(value: Record<string, unknown>) {
  const keys = Object.keys(value);
  return keys.length > 0 ? JSON.stringify(value, null, 2) : '{}';
}

function normalizeGroup(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : 'General';
}

function normalizeOrder(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(numeric));
}

function parseValidationRulesObject(raw: Record<string, unknown> | undefined | null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rules = { ...source } as Record<string, unknown>;
  const group = normalizeGroup(rules.group);
  const order = normalizeOrder(rules.order, 10);
  delete rules.group;
  delete rules.order;

  return { rules, group, order };
}

function toDraft(definition: CustomFieldDefinition): BuilderFieldDraft {
  const defaultValue = definition.default_value;
  const parsedValidationRules = parseValidationRulesObject(definition.validation_rules ?? {});
  const defaultValueText =
    definition.field_type === 'multi_select'
      ? Array.isArray(defaultValue)
        ? defaultValue.map((item) => String(item)).join('\n')
        : ''
      : definition.field_type === 'boolean'
        ? ''
        : defaultValue === null || defaultValue === undefined
          ? ''
          : String(defaultValue);

  return {
    localId: createLocalId(),
    id: definition.id,
    field_key: definition.field_key,
    label: definition.label,
    field_type: definition.field_type,
    group: parsedValidationRules.group,
    order: normalizeOrder(parsedValidationRules.order, (definition.position + 1) * 10),
    is_required: definition.is_required,
    is_active: definition.is_active !== false,
    is_system: definition.is_system ?? false,
    optionsText: Array.isArray(definition.options) ? definition.options.join('\n') : '',
    placeholder: definition.placeholder ?? '',
    help_text: definition.help_text ?? '',
    validationRulesText: normalizeValidationRulesText(parsedValidationRules.rules),
    defaultValueText,
    defaultValueBoolean: Boolean(defaultValue),
  };
}

function createNewField(type: CustomFieldType = 'text'): BuilderFieldDraft {
  const timestamp = Date.now().toString(36).slice(-4);
  return {
    localId: createLocalId(),
    field_key: `custom_field_${timestamp}`,
    label: 'New field',
    field_type: type,
    group: 'General',
    order: 10,
    is_required: false,
    is_active: true,
    is_system: false,
    optionsText: '',
    placeholder: '',
    help_text: '',
    validationRulesText: '{}',
    defaultValueText: '',
    defaultValueBoolean: false,
  };
}

function isOptionField(type: CustomFieldType) {
  return type === 'select' || type === 'multi_select';
}

function parseOptions(optionsText: string) {
  const unique = new Set<string>();

  for (const line of optionsText.split('\n')) {
    const option = line.trim();

    if (option.length > 0) {
      unique.add(option);
    }
  }

  return [...unique];
}

function parseValidationRules(text: string) {
  const nextText = text.trim() || '{}';
  const parsed = JSON.parse(nextText) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Validation rules must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function normalizeDefaultValue(field: BuilderFieldDraft, options: string[]) {
  if (field.field_type === 'boolean') {
    return field.defaultValueBoolean;
  }

  if (field.field_type === 'multi_select') {
    const selected = parseOptions(field.defaultValueText);

    if (options.length > 0) {
      const invalid = selected.find((item) => !options.includes(item));
      if (invalid) {
        throw new Error(`Default option "${invalid}" does not exist in options.`);
      }
    }

    return selected;
  }

  const rawText = field.defaultValueText.trim();
  if (!rawText) {
    return null;
  }

  if (field.field_type === 'number') {
    const numeric = Number(rawText);
    if (Number.isNaN(numeric)) {
      throw new Error('Default value must be numeric.');
    }
    return numeric;
  }

  if (field.field_type === 'select' && options.length > 0 && !options.includes(rawText)) {
    throw new Error('Default value for select fields must match one of the options.');
  }

  return rawText;
}

function toPayloadField(field: BuilderFieldDraft): CustomFieldDefinitionInput {
  const fieldKey = toFieldKey(field.field_key);
  const options = parseOptions(field.optionsText);
  const parsedRules = parseValidationRules(field.validationRulesText);

  return {
    id: field.id,
    field_key: fieldKey,
    label: field.label.trim(),
    field_type: field.field_type,
    // group and order are stored in validation_rules to avoid schema changes.
    validation_rules: {
      ...parsedRules,
      group: normalizeGroup(field.group),
      order: normalizeOrder(field.order, 10),
    },
    is_required: field.is_required,
    is_active: field.is_active,
    options: isOptionField(field.field_type) ? options : null,
    placeholder: field.placeholder.trim() || null,
    help_text: field.help_text.trim() || null,
    default_value: normalizeDefaultValue(field, options),
  };
}

function toPreviewDefinition(field: BuilderFieldDraft, position: number): CustomFieldDefinition {
  const options = parseOptions(field.optionsText);
  const defaultValue = normalizeDefaultValue(field, options);
  const parsedRules = parseValidationRules(field.validationRulesText);

  return {
    id: field.id ?? field.localId,
    field_key: toFieldKey(field.field_key),
    label: field.label.trim() || 'Untitled field',
    field_type: field.field_type,
    is_required: field.is_required,
    is_active: field.is_active,
    is_system: field.is_system ?? false,
    options: isOptionField(field.field_type) ? options : null,
    placeholder: field.placeholder.trim() || null,
    help_text: field.help_text.trim() || null,
    validation_rules: {
      ...parsedRules,
      group: normalizeGroup(field.group),
      order: normalizeOrder(field.order, 10),
    },
    default_value: defaultValue,
    position,
  };
}

function formatFieldTypeLabel(value: CustomFieldType) {
  return value.replaceAll('_', ' ');
}

function sortDraftFields(fields: BuilderFieldDraft[]) {
  return [...fields].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.label.localeCompare(right.label);
  });
}

function TogglePill({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 items-center rounded-full border transition ${
        checked ? 'border-indigo-500 bg-indigo-600' : 'border-slate-300 bg-slate-100'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
          checked ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function RecordFormBuilderPage() {
  const navigate = useNavigate();
  const { session, workspace, signOut } = useAuth();
  const { config, configLoading, refreshConfig } = useCrmWorkspace();
  const [draftFields, setDraftFields] = useState<BuilderFieldDraft[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<CrmWorkspaceConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'form_builder' | 'service_types'>('form_builder');

  const workspaceId = workspace?.id ?? null;
  const isOwner = isWorkspaceOwner(workspace);

  const selectedField = useMemo(
    () => draftFields.find((field) => field.localId === selectedLocalId) ?? null,
    [draftFields, selectedLocalId],
  );
  const sortedFields = useMemo(() => sortDraftFields(draftFields), [draftFields]);
  const selectedServiceTypeFields = useMemo(() => sortedFields, [sortedFields]);
  const selectedServiceTypeLabel = 'All service types';

  async function loadBuilderFields() {
    if (!session || !workspaceId) {
      return;
    }

    setFieldsLoading(true);

    try {
      const fields = await fetchWorkspaceCustomFields(session, workspaceId);
      const nextDrafts = fields.map(toDraft);
      setDraftFields(nextDrafts);
      setSelectedLocalId((current) =>
        nextDrafts.some((field) => field.localId === current) ? current : (nextDrafts[0]?.localId ?? null),
      );
      setHasUnsavedChanges(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load custom fields.';
      toast.error(message);
    } finally {
      setFieldsLoading(false);
    }
  }

  useEffect(() => {
    if (!session || !workspaceId || !isOwner) {
      return;
    }

    void loadBuilderFields();
  }, [session, workspaceId, isOwner]);

  useEffect(() => {
    if (!selectedLocalId) {
      if (selectedServiceTypeFields.length > 0) {
        setSelectedLocalId(selectedServiceTypeFields[0].localId);
      }
      return;
    }

    const selectedIsVisible = selectedServiceTypeFields.some((field) => field.localId === selectedLocalId);
    if (!selectedIsVisible) {
      setSelectedLocalId(selectedServiceTypeFields[0]?.localId ?? null);
    }
  }, [selectedLocalId, selectedServiceTypeFields]);

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  function updateDraftField(localId: string, updater: (current: BuilderFieldDraft) => BuilderFieldDraft) {
    setDraftFields((current) => current.map((field) => (field.localId === localId ? updater(field) : field)));
    setHasUnsavedChanges(true);
  }

  function addField(type: CustomFieldType = 'text', groupName?: string) {
    const maxOrder = draftFields.reduce((max, field) => Math.max(max, field.order), 0);
    const nextField = createNewField(type);
    nextField.order = maxOrder + 10;
    if (groupName && groupName.trim()) {
      nextField.group = groupName.trim();
    }
    setDraftFields((current) => [...current, nextField]);
    setSelectedLocalId(nextField.localId);
    setHasUnsavedChanges(true);
  }

  function removeField(localId: string) {
    setDraftFields((current) =>
      current.flatMap((field) => {
        if (field.localId !== localId) {
          return [field];
        }

        if (field.id) {
          return [{ ...field, is_active: false }];
        }

        return [];
      }),
    );
    setSelectedLocalId((current) => (current === localId ? null : current));
    setHasUnsavedChanges(true);
  }

  function duplicateField(localId: string) {
    setDraftFields((current) => {
      const index = current.findIndex((field) => field.localId === localId);
      if (index < 0) {
        return current;
      }

      const original = current[index];
      const duplicated: BuilderFieldDraft = {
        ...original,
        localId: createLocalId(),
        id: undefined,
        field_key: toFieldKey(`${original.field_key}_copy`),
        label: `${original.label} copy`,
      };

      const next = [...current];
      next.splice(index + 1, 0, duplicated);
      setSelectedLocalId(duplicated.localId);
      return next;
    });
    setHasUnsavedChanges(true);
  }

  function moveField(localId: string, direction: -1 | 1) {
    setDraftFields((current) => {
      const ordered = sortDraftFields(current);
      const index = ordered.findIndex((field) => field.localId === localId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) {
        return current;
      }

      const currentField = ordered[index];
      const swapField = ordered[nextIndex];

      return current.map((field) => {
        if (field.localId === currentField.localId) {
          return { ...field, order: swapField.order };
        }

        if (field.localId === swapField.localId) {
          return { ...field, order: currentField.order };
        }

        return field;
      });
    });
    setHasUnsavedChanges(true);
  }

  function resetToPublished() {
    if (!session || !workspaceId) {
      return;
    }
    void loadBuilderFields();
    toast.success('Reverted to saved form fields.');
  }

  async function handleSave() {
    if (!session || !workspaceId) {
      return;
    }

    try {
      const payload = sortedFields.map(toPayloadField);
      const keys = new Set<string>();

      for (let index = 0; index < payload.length; index += 1) {
        const field = payload[index];

        if (!field.label || field.label.length < 2) {
          throw new Error(`Field ${index + 1}: label must be at least 2 characters.`);
        }

        if (!field.field_key || !/^[a-z][a-z0-9_]{1,47}$/.test(field.field_key)) {
          throw new Error(
            `Field ${index + 1}: key must start with a letter and use only lowercase letters, numbers, and underscores.`,
          );
        }

        if (keys.has(field.field_key)) {
          throw new Error(`Duplicate key detected: ${field.field_key}`);
        }

        keys.add(field.field_key);
      }

      setSaving(true);
      await updateWorkspaceCustomFields(session, workspaceId, payload);
      await refreshConfig();
      await loadBuilderFields();
      toast.success('Form fields saved. Create Record now uses this form automatically.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save form fields.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function handleOpenPreview() {
    if (!config) {
      return;
    }

    try {
      const customFields = sortedFields
        .filter((field) => field.is_active)
        .map((field, index) => toPreviewDefinition(field, index));
      setPreviewConfig({
        ...config,
        customFields,
      });
      setIsPreviewDrawerOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to build preview.';
      toast.error(message);
    }
  }

  function handleClosePreview() {
    setIsPreviewDrawerOpen(false);
  }

  useEffect(() => {
    if (!isPreviewDrawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPreviewDrawerOpen]);

  useEffect(() => {
    if (!isPreviewDrawerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsPreviewDrawerOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewDrawerOpen]);

  if (!session || !workspace) {
    return <FullPageLoader label="Loading form builder..." />;
  }

  if (!isOwner) {
    return <Navigate to={`/dashboard/${workspace.crmType}`} replace />;
  }

  if ((configLoading && !config) || (fieldsLoading && draftFields.length === 0)) {
    return <FullPageLoader label="Loading form builder..." />;
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={handleSignOut}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Records setup"
          title="Form Builder"
          description="Customize custom record fields, preview changes instantly, and publish updates for Create Record."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={handleOpenPreview}>
                <Eye className="h-4 w-4" />
                Show preview
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={resetToPublished} disabled={!hasUnsavedChanges}>
                Reset
              </Button>
              <Button type="button" size="sm" loading={saving} onClick={() => void handleSave()}>
                Save form
              </Button>
            </div>
          )}
        />

        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab('form_builder')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === 'form_builder'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Form Builder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('service_types')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === 'service_types'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            Service Types
          </button>
        </div>

        {activeTab === 'service_types' ? (
          <Card className="p-6">
            <h3 className="text-xl font-semibold text-slate-900">Service Types</h3>
            <p className="mt-2 text-sm text-slate-600">
              Service type management will be handled here. Use the Form Builder tab to configure field behavior now.
            </p>
          </Card>
        ) : null}

        {activeTab === 'form_builder' ? (
          <>
            <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
              <Card className="space-y-4 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">Custom fields</h3>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => addField('text', selectedField?.group ?? 'General')}
                  >
                    <Plus className="h-4 w-4" />
                    Add field
                  </Button>
                </div>

                <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                  {selectedServiceTypeFields.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      No fields yet.
                    </div>
                  ) : (
                    selectedServiceTypeFields.map((field, index) => (
                      <button
                        key={field.localId}
                        type="button"
                        onClick={() => setSelectedLocalId(field.localId)}
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                          selectedLocalId === field.localId
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {field.label || 'Untitled field'}
                            </div>
                            <div className="truncate text-xs text-slate-500">{field.field_key}</div>
                            <div className="mt-2 text-xs text-slate-500">
                              #{index + 1}
                              {field.is_required ? ' • Required' : ''}
                              {field.is_active ? '' : ' • Inactive'}
                            </div>
                          </div>
                          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                            {formatFieldTypeLabel(field.field_type)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </Card>

              <Card className="space-y-4 p-5">
                <div>
                  <h3 className="text-2xl font-semibold text-slate-900">Field Builder</h3>
                  <p className="text-sm text-slate-600">Selected type: {selectedServiceTypeLabel}</p>
                </div>

                {selectedField ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        label="Field key"
                        value={selectedField.field_key}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            field_key: toFieldKey(event.target.value),
                          }))
                        }
                        placeholder="confirmation_number"
                      />
                      <Input
                        label="Label"
                        value={selectedField.label}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                        placeholder="Confirmation Number"
                      />
                      <label className="flex flex-col gap-2 text-sm text-slate-700">
                        <span className="font-medium">Type</span>
                        <select
                          value={selectedField.field_type}
                          disabled={selectedField.is_system}
                          onChange={(event) =>
                            updateDraftField(selectedField.localId, (current) => ({
                              ...current,
                              field_type: event.target.value as CustomFieldType,
                            }))
                          }
                          className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                        >
                          {supportedFieldTypes.map((fieldType) => (
                            <option key={fieldType.value} value={fieldType.value}>
                              {fieldType.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        label="Group"
                        value={selectedField.group}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            group: event.target.value,
                          }))
                        }
                        placeholder="Request Details"
                      />
                      <Input
                        label="Order"
                        type="number"
                        value={String(selectedField.order)}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            order: normalizeOrder(event.target.value, current.order),
                          }))
                        }
                        placeholder="10"
                      />
                      <Input
                        label="Placeholder"
                        value={selectedField.placeholder}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            placeholder: event.target.value,
                          }))
                        }
                        placeholder="ABC123"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        label="Default value"
                        value={selectedField.defaultValueText}
                        disabled={selectedField.is_system || selectedField.field_type === 'boolean'}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            defaultValueText: event.target.value,
                          }))
                        }
                        placeholder="Optional"
                      />
                      <Input
                        label="Options (comma separated)"
                        value={selectedField.optionsText.replaceAll('\n', ', ')}
                        disabled={selectedField.is_system || !isOptionField(selectedField.field_type)}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            optionsText: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean)
                              .join('\n'),
                          }))
                        }
                        placeholder="option_a, option_b"
                      />
                      <Input
                        label="Help text"
                        value={selectedField.help_text}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            help_text: event.target.value,
                          }))
                        }
                        placeholder="Shown below input"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Required</span>
                        <TogglePill
                          checked={selectedField.is_required}
                          disabled={selectedField.is_system}
                          onChange={(next) =>
                            updateDraftField(selectedField.localId, (current) => ({
                              ...current,
                              is_required: next,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">Active</span>
                        <TogglePill
                          checked={selectedField.is_active}
                          disabled={selectedField.is_system}
                          onChange={(next) =>
                            updateDraftField(selectedField.localId, (current) => ({
                              ...current,
                              is_active: next,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => moveField(selectedField.localId, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                          Move up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => moveField(selectedField.localId, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                          Move down
                        </Button>
                      </div>
                    </div>

                    <label className="flex flex-col gap-2 text-sm text-slate-700">
                      <span className="font-medium">Validation rules (JSON)</span>
                      <textarea
                        rows={4}
                        value={selectedField.validationRulesText}
                        disabled={selectedField.is_system}
                        onChange={(event) =>
                          updateDraftField(selectedField.localId, (current) => ({
                            ...current,
                            validationRulesText: event.target.value,
                          }))
                        }
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                        placeholder='{"min": 0, "max": 1000}'
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => duplicateField(selectedField.localId)}>
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={selectedField.is_system}
                          onClick={() => removeField(selectedField.localId)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          addField('text', selectedField.group)
                        }
                      >
                        <Plus className="h-4 w-4" />
                        Add Field
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No field selected. Add a field to start building this form.
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addField('text', 'General')}
                      >
                        <Plus className="h-4 w-4" />
                        Add Field
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

            </div>

            <Card className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-semibold text-slate-900">Fields</h3>
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    addField('text', selectedField?.group ?? 'General')
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add field
                </Button>
              </div>

              {sortedFields.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No fields yet. Add a field to start building your form.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[980px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-left text-lg text-slate-600">
                        <th className="px-5 py-4 font-medium">Label</th>
                        <th className="px-5 py-4 font-medium">Key</th>
                        <th className="px-5 py-4 font-medium">Type</th>
                        <th className="px-5 py-4 font-medium">Group</th>
                        <th className="px-5 py-4 font-medium">Order</th>
                        <th className="px-5 py-4 font-medium">Required</th>
                        <th className="px-5 py-4 font-medium">Active</th>
                        <th className="px-5 py-4 font-medium text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFields.map((field) => (
                        <tr
                          key={field.localId}
                          className={`border-t border-slate-200 ${
                            selectedLocalId === field.localId ? 'bg-indigo-50/50' : 'bg-white'
                          }`}
                        >
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() => setSelectedLocalId(field.localId)}
                              className="text-left text-lg leading-7 text-slate-900 hover:text-indigo-700"
                            >
                              {field.label || 'Untitled field'}
                            </button>
                          </td>
                          <td className="px-5 py-4 font-mono text-sm text-slate-900">{field.field_key}</td>
                          <td className="px-5 py-4 text-lg capitalize text-slate-900">{formatFieldTypeLabel(field.field_type)}</td>
                          <td className="px-5 py-4 text-lg text-slate-900">{field.group}</td>
                          <td className="px-5 py-4 text-lg text-slate-900">{field.order}</td>
                          <td className="px-5 py-4">
                            <TogglePill
                              checked={field.is_required}
                              disabled={field.is_system}
                              onChange={(next) =>
                                updateDraftField(field.localId, (current) => ({
                                  ...current,
                                  is_required: next,
                                }))
                              }
                            />
                          </td>
                          <td className="px-5 py-4">
                            <TogglePill
                              checked={field.is_active}
                              disabled={field.is_system}
                              onChange={(next) =>
                                updateDraftField(field.localId, (current) => ({
                                  ...current,
                                  is_active: next,
                                }))
                              }
                            />
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              type="button"
                              disabled={field.is_system}
                              onClick={() => removeField(field.localId)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Trash2 className="h-6 w-6" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        ) : null}
      </div>

      <div
        className={`fixed inset-0 z-50 transition ${isPreviewDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!isPreviewDrawerOpen}
      >
        <button
          type="button"
          aria-label="Close preview drawer"
          onClick={handleClosePreview}
          className={`absolute inset-0 bg-transparent transition duration-300 ${isPreviewDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
        />

        <aside
          className={`absolute inset-y-0 right-0 flex w-full max-w-5xl flex-col border-l border-slate-300 bg-slate-50 shadow-2xl backdrop-blur-xl transition duration-300 ${isPreviewDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-form-preview-title"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-300 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Form preview</div>
              <h2 id="record-form-preview-title" className="mt-2 truncate font-display text-2xl text-slate-900">
                Create Record preview
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Full form preview with current draft fields. This does not save a record.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClosePreview}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-slate-700 transition hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {previewConfig ? (
              <RecordForm
                workspaceId={workspace.id}
                config={previewConfig}
                submitLabel="Preview only"
                onSubmit={async () => {
                  toast.info('This is preview mode only.');
                }}
              />
            ) : (
              <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
                Preview is not available right now.
              </div>
            )}
          </div>
        </aside>
      </div>
    </WorkspaceLayout>
  );
}

