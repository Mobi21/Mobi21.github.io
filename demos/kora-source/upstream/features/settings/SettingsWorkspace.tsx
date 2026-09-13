import { Route, Routes } from "react-router-dom";
import { InvalidRouteRecovery } from "../../app/InvalidRouteRecovery";
import type { ConversationContextReference } from "../../lib/runtime";
import {
  AppearancePage, BackgroundPage, DataPage, DiagnosticsPage, IntegrationDetailPage,
  IntegrationsPage, ModelProviderPage, ModelSettingsPage, NotificationsSettingsPage,
  ScheduleDetailPage, ScheduleEditorPage, ScheduleRunDetailPage, SchedulesPage, SettingsOverview,
} from "./pages";
import "./settings.css";

export function SettingsWorkspace({
  onAskKora,
}: {
  onAskKora?: (reference: ConversationContextReference) => void;
}) {
  /* Settings destinations are owned by SettingsLayout's local rail/compact
     Sheet, not the global workspace switcher. The route body therefore owns no
     second navigation registry or repeated Settings identity block. */
  return <section className="settings-workspace">
    <div className="settings-stage">
      <Routes>
        <Route index element={<SettingsOverview />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="schedules/new" element={<ScheduleEditorPage />} />
        <Route
          path="schedules/:scheduleId/runs/:runId"
          element={<ScheduleRunDetailPage onAskKora={onAskKora} />}
        />
        <Route path="schedules/:scheduleId" element={<ScheduleDetailPage />} />
        <Route path="notifications" element={<NotificationsSettingsPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="integrations/:integrationId" element={<IntegrationDetailPage />} />
        <Route path="model" element={<ModelSettingsPage />} />
        <Route path="model/providers/:providerId" element={<ModelProviderPage />} />
        <Route path="background" element={<BackgroundPage />} />
        <Route path="appearance" element={<AppearancePage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="diagnostics" element={<DiagnosticsPage />} />
        <Route path="*" element={<InvalidRouteRecovery />} />
      </Routes>
    </div>
  </section>;
}

export {
  ApprovalDetailPage, NotificationDetailPage, NotificationInboxPage,
} from "./pages";
export { ApprovalPanel } from "./ApprovalPanel";
