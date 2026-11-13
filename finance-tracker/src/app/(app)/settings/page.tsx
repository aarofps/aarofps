import { getDb } from "@/db/client";
import { accounts, connections } from "@/db/schema";
import { getSetting } from "@/lib/settings";
import { getThresholds } from "@/lib/settingsOps";
import { ACCESS_URL_KEY } from "@/lib/simplefin/sync";
import { AccountsPanel, CsvImportPanel, ManualAccountPanel, PreferencesPanel, SimplefinPanel } from "@/components/SettingsPanels";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const db = getDb();
  const accts = db.select().from(accounts).orderBy(accounts.name).all();
  const missingKey = !process.env.ENCRYPTION_KEY;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {missingKey && (
        <div className="rounded-lg border border-negative/40 bg-negative/10 px-4 py-3 text-sm">
          ENCRYPTION_KEY is missing from .env.local, so bank connection is disabled. See the README.
        </div>
      )}
      <SimplefinPanel connected={!!getSetting(db, ACCESS_URL_KEY)} connections={db.select().from(connections).all()} />
      <AccountsPanel accounts={accts} />
      <ManualAccountPanel />
      <CsvImportPanel accounts={accts.map((a) => ({ id: a.id, name: a.name }))} />
      <PreferencesPanel {...getThresholds(db)} />
    </div>
  );
}
