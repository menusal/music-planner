import React from 'react';
import { WifiIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import usePWA from '../hooks/usePWA';

const OfflineIndicator: React.FC = () => {
  const { t } = useTranslation();
  const { isOffline } = usePWA();

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-white px-4 py-2">
      <div className="flex items-center justify-center space-x-2">
        <NoSymbolIcon className="h-4 w-4" />
        <span className="text-sm font-medium">
          {t('offline.message', 'You are currently offline. Some features may be limited.')}
        </span>
        <WifiIcon className="h-4 w-4 opacity-50" />
      </div>
    </div>
  );
};

export default OfflineIndicator;
