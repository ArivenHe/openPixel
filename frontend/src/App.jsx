import { AdminApp } from "./components/AdminApp.jsx";
import { DashboardApp } from "./components/DashboardApp.jsx";
import { DrawApp } from "./components/DrawApp.jsx";
import { LotteryApp } from "./components/LotteryApp.jsx";
import { MobileApp } from "./components/MobileApp.jsx";

export const App = () => {
  const path = window.location.pathname;

  if (path.startsWith("/dashboard")) {
    return <DashboardApp />;
  }

  if (path.startsWith("/admin")) {
    return <AdminApp />;
  }

  if (path.startsWith("/draw")) {
    return <DrawApp />;
  }

  if (path.startsWith("/lottery")) {
    return <LotteryApp />;
  }

  return <MobileApp />;
};
