import React, { useState, useEffect } from 'react';
import { CloudArrowUpIcon, CloudArrowDownIcon, WifiIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import { getSyncStatus } from '../services/syncService';
import { useTranslation } from 'react-i18next';

const SyncStatus: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{
    isOnline: boolean;
    isSyncing: boolean;
    pendingOperations: number;
  }>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingOperations: 0,
  });

  useEffect(() => {
    const updateStatus = async () => {
      const currentStatus = await getSyncStatus();
      setStatus(currentStatus);
    };

    // Update status immediately
    updateStatus();

    // Update status every 5 seconds
    const intervalId = setInterval(updateStatus, 5000);

    // Listen for online/offline events
    const handleOnline = () => updateStatus();
    const handleOffline = () => updateStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Always show the indicator
  return (
    <div className="flex items-center space-x-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">
      {status.isOnline ? (
        <WifiIcon className="h-4 w-4 text-green-500" />
      ) : (
        <NoSymbolIcon className="h-4 w-4 text-yellow-500" />
      )}
      <span className="text-xs font-medium text-white">
        {status.isOnline
          ? t('sync.online', 'Online')
          : t('sync.offline', 'Offline')}
      </span>
      {status.pendingOperations > 0 && (
        <span className="text-xs text-yellow-500">
          ({status.pendingOperations})
        </span>
      )}
      {status.isSyncing && (
        <CloudArrowDownIcon className="h-4 w-4 text-blue-400 animate-pulse" />
      )}
      {status.isOnline && status.pendingOperations === 0 && !status.isSyncing && (
        <CloudArrowUpIcon className="h-4 w-4 text-green-500" />
      )}
    </div>
  );
};

export default SyncStatus;
