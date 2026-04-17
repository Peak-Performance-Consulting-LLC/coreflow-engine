import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FullPageLoader } from '../components/ui/FullPageLoader';

export function RecordCreatePage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/records', { replace: true, state: { openCreateRecord: true } });
  }, [navigate]);

  return <FullPageLoader label="Opening record creator..." />;
}
