import { Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import InstallPrompt from "./components/InstallPrompt";
import ServiceWorkerUpdater from "./components/ServiceWorkerUpdater";
import OfflineIndicator from "./components/OfflineIndicator";

export default function App() {
  return (
    <>
      <OfflineIndicator />
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
        </Route>
      </Routes>
      <InstallPrompt />
      <ServiceWorkerUpdater />
    </>
  );
}
