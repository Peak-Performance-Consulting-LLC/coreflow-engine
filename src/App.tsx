import { AppGuideProvider } from './context/AppGuideContext';
import { AppRoutes } from './routes/AppRoutes';

export default function App() {
  return (
    <AppGuideProvider>
      <AppRoutes />
    </AppGuideProvider>
  );
}
