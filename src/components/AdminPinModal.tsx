import React, { useState } from 'react';
import { Lock, KeyRound, ShieldCheck, X, AlertCircle, Loader2 } from 'lucide-react';
import { verifyPinRemote } from '../utils/googleAppsScript';

interface AdminPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (role: 'admin' | 'kurikulum') => void;
  webAppUrl: string;
}

export const AdminPinModal: React.FC<AdminPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  webAppUrl
}) => {
  const [pinInput, setPinInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmed = pinInput.trim();
    if (!trimmed) {
      setErrorMsg('Silakan masukkan PIN terlebih dahulu.');
      return;
    }

    if (!webAppUrl) {
      setErrorMsg('URL Google Apps Script belum diatur di Pengaturan. Pastikan Web App terhubung untuk validasi PIN server.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await verifyPinRemote(webAppUrl, trimmed);
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5 relative">
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

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label htmlFor="input-admin-pin" className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#2F5597]" />
              <span>PIN Server (Admin / Kurikulum)</span>
            </label>
            <input
              type="password"
              id="input-admin-pin"
              autoFocus
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
