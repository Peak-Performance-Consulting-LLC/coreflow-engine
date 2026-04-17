import { useContext } from 'react';
import { CrmWorkspaceContext } from '../context/CrmWorkspaceContext';

export function useCrmWorkspace() {
  const context = useContext(CrmWorkspaceContext);

  if (!context) {
    throw new Error('useCrmWorkspace must be used within a CrmWorkspaceProvider.');
  }

  return context;
}
