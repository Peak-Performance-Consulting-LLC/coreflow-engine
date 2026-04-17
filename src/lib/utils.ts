import { clsx, type ClassValue } from 'clsx';
import { crmOptions } from './constants';
import type { CRMType, WorkspaceSummary } from './types';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

export function isValidWorkspaceSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length >= 3;
}

export function getCrmOption(crmType: CRMType) {
  return crmOptions.find((option) => option.value === crmType) ?? crmOptions[0];
}

export function getDashboardPath(workspace: Pick<WorkspaceSummary, 'crmType'> | { crmType: CRMType }) {
  return `/dashboard/${workspace.crmType}`;
}

export function formatCrmLabel(crmType: CRMType) {
  return getCrmOption(crmType).label;
}

export function getInitials(value: string) {
  return value
    .split(' ')
    .map((chunk) => chunk[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
