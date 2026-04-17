import { Outlet } from 'react-router-dom';
import { CrmWorkspaceProvider } from '../context/CrmWorkspaceContext';

export function CrmWorkspaceRoute() {
  return (
    <CrmWorkspaceProvider>
      <Outlet />
    </CrmWorkspaceProvider>
  );
}
