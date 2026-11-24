import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, ShieldCheck, X, AlertCircle, Loader2, Link as LinkIcon } from 'lucide-react';
import { verifyPinRemote } from '../utils/googleAppsScript';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (role: 'admin' | 'kurikulum') => void;
  webAppUrl: string;
  onSaveWebAppUrl?: (url: string) => void;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  webAppUrl,
  onSaveWebAppUrl
}) => {
  const [pinInput, setPinInput] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>(webAppUrl || '');
  const [showUrlField, setShowUrlField] = useState<boolean>(!webAppUrl);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(webAppUrl || '');
      setShowUrlField(!webAppUrl);
      setErrorMsg('');
    }
  }, [isOpen, webAppUrl]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedPin = pinInput.trim();
    const targetUrl = (showUrlField ? urlInput : webAppUrl).trim();

    if (!targetUrl) {
      setErrorMsg('Tempel URL Google Apps Script Web App (https://script.google.com/macros/s/.../exec) terlebih dahulu.');
      setShowUrlField(true);
      return;
    }

    if (!targetUrl.startsWith('https://script.google.com/')) {
      setErrorMsg('URL Web App harus diawali https://script.google.com/... (salin dari menu Deploy > Web App di Google Sheets).');
      setShowUrlField(true);
      return;
    }

    if (!trimmedPin) {
      setErrorMsg('Silakan masukkan PIN terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    try {
      if (targetUrl !== webAppUrl && onSaveWebAppUrl) {
        onSaveWebAppUrl(targetUrl);
      }

      const res = await verifyPinRemote(targetUrl, trimmedPin);
      if (res.success && res.role) {
        setPinInput('');
        onSuccess(res.role);
      } else {
        setErrorMsg(res.message || 'PIN tidak valid. Silakan coba lagi.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghubungi server untuk verifikasi PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5 relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">
              Autentikasi Hak Akses
            </h3>
            <p className="text-xs text-slate-500">
              Masukkan PIN Admin atau PIN Kurikulum (validasi server Apps Script)
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {showUrlField ? (
            <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
              <label htmlFor="input-modal-webapp-url" className="block text-xs font-bold text-blue-950 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-[#2F5597]" />
                <span>URL Google Apps Script Web App</span>
              </label>
              <input
                type="url"
                id="input-modal-webapp-url"
                disabled={isLoading}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-2 focus:ring-[#2F5597] focus:outline-none disabled:opacity-50"
              />
              <p className="text-[10.5px] text-blue-900 leading-relaxed">
                Pada GitHub Pages baru, URL server belum terbaca jika <code className="font-mono font-bold bg-blue-100 px-1 rounded">VITE_WEB_APP_URL</code> belum diisi di <strong>GitHub Settings &rarr; Secrets and variables &rarr; Actions &rarr; Variables</strong>. Tempel URL Web App di sini agar langsung tersinkron.
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px]">
              <span className="text-emerald-800 font-semibold truncate mr-2">
                Server terhubung ke Apps Script
              </span>
              <button
                type="button"
                onClick={() => setShowUrlField(true)}
                className="text-emerald-900 font-bold underline shrink-0 hover:text-emerald-700"
              >
                Ubah URL
              </button>
            </div>
          )}

          <div>
            <label htmlFor="input-admin-pin" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#2F5597]" />
              <span>PIN Server (Admin / Kurikulum)</span>
            </label>
            <input
              type="password"
              id="input-admin-pin"
              autoFocus={!showUrlField}
              maxLength={12}
              disabled={isLoading}
              placeholder="Masukkan PIN Anda"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-center text-lg font-mono font-bold tracking-widest text-slate-800 focus:ring-2 focus:ring-[#2F5597] focus:outline-none disabled:opacity-50"
            />
            <p className="text-[11px] text-slate-500 mt-1.5 text-center leading-relaxed">
              PIN divalidasi langsung di Apps Script (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-700">Script Properties</code>). Tidak pernah disimpan di browser.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs font-semibold text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-snug">{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 bg-[#2F5597] hover:bg-[#234278] text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verifikasi PIN</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
