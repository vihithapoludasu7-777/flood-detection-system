import React from 'react';
import { AlertNetProvider, useAlertNet } from './context/AlertNetContext.tsx';
import { LayoutShell } from './components/LayoutShell.tsx';
import { HomeDashboard } from './components/views/HomeDashboard.tsx';
import { LiveFloodMapView } from './components/views/LiveFloodMapView.tsx';
import { FloodPredictionView } from './components/views/FloodPredictionView.tsx';
import { EmergencySOSView } from './components/views/EmergencySOSView.tsx';
import { AIAssistantView } from './components/views/AIAssistantView.tsx';
import { CommunityChatView } from './components/views/CommunityChatView.tsx';
import { SmartAgricultureView } from './components/views/SmartAgricultureView.tsx';
import { SafetyGuidelinesView } from './components/views/SafetyGuidelinesView.tsx';
import { ProfileAndSettingsView } from './components/views/ProfileAndSettingsView.tsx';
import { AdminRescueView } from './components/views/AdminRescueView.tsx';
import { ArchitectureSimulationView } from './components/views/ArchitectureSimulationView.tsx';

const AlertNetRouter: React.FC = () => {
  const { activeTab } = useAlertNet();

  switch (activeTab) {
    case 'home':
      return <HomeDashboard />;
    case 'map':
      return <LiveFloodMapView />;
    case 'prediction':
      return <FloodPredictionView />;
    case 'sos':
      return <EmergencySOSView />;
    case 'assistant':
      return <AIAssistantView />;
    case 'chat':
      return <CommunityChatView />;
    case 'agriculture':
      return <SmartAgricultureView />;
    case 'guidelines':
      return <SafetyGuidelinesView />;
    case 'profile':
      return <ProfileAndSettingsView />;
    case 'admin':
      return <AdminRescueView />;
    case 'architecture':
      return <ArchitectureSimulationView />;
    default:
      return <HomeDashboard />;
  }
};

export default function App() {
  return (
    <AlertNetProvider>
      <LayoutShell>
        <AlertNetRouter />
      </LayoutShell>
    </AlertNetProvider>
  );
}
