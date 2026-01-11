import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

const ServiceWorkerUpdater: React.FC = () => {
  const { t } = useTranslation();
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const handleSWUpdate = (event: CustomEvent) => {
      const registration = event.detail;
      if (registration && registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdatePrompt(true);
      }
    };

    // Listen for service worker updates
    window.addEventListener('sw-update-available' as any, handleSWUpdate);

    return () => {
      window.removeEventListener('sw-update-available' as any, handleSWUpdate);
    };
  }, []);

  const handleUpdateClick = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdatePrompt(false);
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowUpdatePrompt(false);
  };

  if (!showUpdatePrompt) {
    return null;
  }

  return (
    <div className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-sm">
      <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ArrowPathIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {t('update.title', 'App Update Available')}
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              {t('update.description', 'A new version of the app is available.')}
            </p>
            <div className="mt-3 flex space-x-2">
              <button
                onClick={handleUpdateClick}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1 px-3 rounded transition-colors duration-200"
              >
                {t('update.button', 'Update Now')}
              </button>
              <button
                onClick={handleDismiss}
                className="bg-transparent hover:bg-blue-100 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium py-1 px-3 rounded transition-colors duration-200"
              >
                {t('update.dismiss', 'Later')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceWorkerUpdater;
