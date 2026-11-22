import React, {useRef, useState} from 'react';
import {
  Download,
  Lock,
  Moon,
  Server,
  ShieldCheck,
  Sun,
  Unlock,
  Upload,
} from 'lucide-react';
import {t} from '../i18n/translations';
import type {
  Customer,
  Language,
  Medicine,
  PharmacySettings,
  PharmacySnapshot,
  Sale,
} from '../types/pharmacy';
import {createEncryptedBackup, parseBackupFile} from '../utils/crypto';

interface SettingsViewProps {
  medicines: Medicine[];
  customers: Customer[];
  sales: Sale[];
  settings: PharmacySettings;
  lang: Language;
  vaultPassphrase: string;
  onSetVaultPassphrase: (pass: string) => void;
  onSaveSettings: (partial: Partial<PharmacySettings>) => Promise<void>;
  onRestoreSnapshot: (snapshot: PharmacySnapshot) => Promise<void>;
  onShowToast: (
    msg: string,
    type?: 'success' | 'info' | 'warning' | 'error',
  ) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  medicines,
  customers,
  sales,
  settings,
  lang,
  vaultPassphrase,
  onSetVaultPassphrase,
  onSaveSettings,
  onRestoreSnapshot,
  onShowToast,
}) => {
  const [form, setForm] = useState(settings);
  const [passInput, setPassInput] = useState('');
  const [backupPass, setBackupPass] = useState('');
  const [restorePass, setRestorePass] = useState('');
  const [pendingRestoreText, setPendingRestoreText] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings(form);
    onShowToast(
      lang === 'bn'
        ? 'ফার্মেসি সেটিংস সংরক্ষিত হয়েছে'
        : 'Pharmacy settings saved',
    );
  };

  const handleUnlockVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput.trim().length < 6) {
      onShowToast(
        lang === 'bn'
          ? 'পাসফ্রেজ কমপক্ষে ৬ অক্ষরের হতে হবে'
          : 'Passphrase must be at least 6 characters',
        'warning',
      );
      return;
    }
    onSetVaultPassphrase(passInput.trim());
    await onSaveSettings({encryptionEnabled: true});
    setPassInput('');
    onShowToast(t(lang, 'vaultActive'));
  };

  const handleLockVault = () => {
    onSetVaultPassphrase('');
    onShowToast(
      lang === 'bn' ? 'ভল্ট লক করা হয়েছে' : 'E2EE Vault locked',
      'info',
    );
  };

  const handleDownloadPlain = () => {
    const snapshot: PharmacySnapshot = {medicines, customers, sales, settings};
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saramoni-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadEncrypted = async () => {
    const key = backupPass.trim() || vaultPassphrase;
    if (key.length < 6) {
      onShowToast(
        lang === 'bn'
          ? 'এনক্রিপ্টেড ব্যাকআপের জন্য ৬+ অক্ষরের পাসফ্রেজ দিন'
          : 'Enter a 6+ character passphrase for encrypted backup',
        'warning',
      );
      return;
    }
    const content = await createEncryptedBackup(
      {medicines, customers, sales, settings},
      key,
    );
    const blob = new Blob([content], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saramoni-e2ee-${new Date().toISOString().slice(0, 10)}.apharma`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast(
      lang === 'bn'
        ? 'AES-256 এনক্রিপ্টেড ব্যাকআপ ডাউনলোড হয়েছে'
        : 'Encrypted backup downloaded',
    );
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const snapshot = await parseBackupFile(text, vaultPassphrase || undefined);
      await onRestoreSnapshot(snapshot);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      if (err instanceof Error && err.message === 'PASSPHRASE_REQUIRED') {
        setPendingRestoreText(text);
      } else {
        onShowToast(
          lang === 'bn'
            ? 'ব্যাকআপ ফাইল সঠিক নয় বা পাসফ্রেজ ভুল'
            : 'Invalid backup file or wrong passphrase',
          'error',
        );
      }
    }
  };

  const handleEncryptedRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRestoreText) return;
    try {
      const snapshot = await parseBackupFile(pendingRestoreText, restorePass);
      await onRestoreSnapshot(snapshot);
      setPendingRestoreText(null);
      setRestorePass('');
    } catch {
      onShowToast(
        lang === 'bn'
          ? 'ভুল পাসফ্রেজ! ডিক্রিপ্ট করা যায়নি'
          : 'Wrong passphrase! Decryption failed',
        'error',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {t(lang, 'settingsTitle')}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Pharmacy Profile & Customization */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {t(lang, 'pharmacyProfile')}
          </h2>

          <form onSubmit={(e) => void handleProfileSave(e)} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'pharmacyNameLabel')}
                </label>
                <input
                  type="text"
                  value={form.pharmacyName}
                  onChange={(e) =>
                    setForm({...form, pharmacyName: e.target.value})
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'pharmacyNameEnLabel')}
                </label>
                <input
                  type="text"
                  value={form.pharmacyNameEn}
                  onChange={(e) =>
                    setForm({...form, pharmacyNameEn: e.target.value})
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'taglineLabel')}
                </label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => setForm({...form, tagline: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'phone')}
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({...form, phone: e.target.value})}
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'address')}
                </label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({...form, address: e.target.value})}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'currencyLabel')}
                </label>
                <input
                  type="text"
                  value={form.currencySymbol}
                  onChange={(e) =>
                    setForm({...form, currencySymbol: e.target.value})
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'expiryDaysLabel')}
                </label>
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={form.expiryAlertDays}
                  onChange={(e) =>
                    setForm({...form, expiryAlertDays: Number(e.target.value)})
                  }
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'vatLabel')}
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={form.defaultVatPercent}
                  onChange={(e) =>
                    setForm({...form, defaultVatPercent: Number(e.target.value)})
                  }
                  className="font-mono-num mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                {t(lang, 'save')}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Appearance, E2EE & Backup */}
        <div className="lg:col-span-5 space-y-6">
          {/* Theme, Language & Table Density */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t(lang, 'appearanceLang')}
            </h2>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'languageLabel')}
                </span>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => void onSaveSettings({language: 'bn'})}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      settings.language === 'bn'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    বাংলা
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSaveSettings({language: 'en'})}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      settings.language === 'en'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    English
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {settings.theme === 'dark'
                    ? t(lang, 'darkMode')
                    : t(lang, 'lightMode')}
                </span>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => void onSaveSettings({theme: 'light'})}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      settings.theme === 'light'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    <span>{t(lang, 'lightMode')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSaveSettings({theme: 'dark'})}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      settings.theme === 'dark'
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    <span>{t(lang, 'darkMode')}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {t(lang, 'densityLabel')}
                </span>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => void onSaveSettings({tableDensity: 'comfortable'})}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      settings.tableDensity === 'comfortable'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {t(lang, 'comfortable')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onSaveSettings({tableDensity: 'compact'})}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      settings.tableDensity === 'compact'
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    {t(lang, 'compact')}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* End-to-End Encryption Vault */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t(lang, 'e2eeTitle')}</span>
              </div>
              <span
                className={`text-[11px] font-semibold ${
                  vaultPassphrase
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                {vaultPassphrase ? t(lang, 'vaultActive') : t(lang, 'vaultInactive')}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t(lang, 'e2eeDesc')}
            </p>

            {vaultPassphrase ? (
              <button
                type="button"
                onClick={handleLockVault}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{t(lang, 'lockVaultBtn')}</span>
              </button>
            ) : (
              <form
                onSubmit={(e) => void handleUnlockVault(e)}
                className="mt-4 flex gap-2"
              >
                <input
                  type="password"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder={t(lang, 'vaultPassphrase')}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Unlock className="h-3.5 w-3.5" />
                  <span>{t(lang, 'unlockEncryptBtn')}</span>
                </button>
              </form>
            )}
          </section>

          {/* Data Backup & Restore */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {t(lang, 'backupRestoreTitle')}
            </h2>

            <div className="mt-3 space-y-3">
              <input
                type="password"
                value={backupPass}
                onChange={(e) => setBackupPass(e.target.value)}
                placeholder={
                  vaultPassphrase
                    ? lang === 'bn'
                      ? 'ভল্ট পাসফ্রেজ ব্যবহৃত হবে (বা নতুন দিন)'
                      : 'Using active vault passphrase (or override)'
                    : t(lang, 'vaultPassphrase')
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadEncrypted()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{t(lang, 'downloadEncryptedBackup')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPlain}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{t(lang, 'downloadPlainBackup')}</span>
                </button>
              </div>

              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.apharma"
                  onChange={(e) => void handleFilePick(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{t(lang, 'restoreBackupBtn')}</span>
                </button>
              </div>

              {pendingRestoreText && (
                <form
                  onSubmit={(e) => void handleEncryptedRestoreSubmit(e)}
                  className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
                >
                  <input
                    required
                    type="password"
                    value={restorePass}
                    onChange={(e) => setRestorePass(e.target.value)}
                    placeholder={t(lang, 'vaultPassphrase')}
                    className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {t(lang, 'confirmPayment')}
                  </button>
                </form>
              )}
            </div>
          </section>

          {/* Self-Hosting & Kubernetes Summary */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Server className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t(lang, 'selfHostDocsTitle')}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t(lang, 'selfHostDocsDesc')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
