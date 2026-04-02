import { Outlet } from "react-router-dom";

export function SettingsWorkspace() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}
