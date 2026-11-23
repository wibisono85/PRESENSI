import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';

interface QrCameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  fps?: number;
  qrboxSize?: number;
  isScanningActive?: boolean;
  instructionText?: string;
}

export const QrCameraScanner: React.FC<QrCameraScannerProps> = ({
  onScanSuccess,
  fps = 10,
  qrboxSize = 250,
  isScanningActive = true,
  instructionText = 'Arahkan kamera ke QR Code'
}) => {
  const scannerContainerId = useRef(`qr-reader-${Math.random().toString(36).substring(2, 9)}`);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [cameraList, setCameraList] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const lastScannedTime = useRef<number>(0);

  useEffect(() => {
    let isMounted = true;

    async function initScanner() {
      if (!isScanningActive) return;
      setIsInitializing(true);
      setCameraError(null);

      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (!devices || devices.length === 0) {
          setCameraError('Tidak ditemukan kamera pada perangkat ini. Pastikan izin kamera telah diberikan.');
          setIsInitializing(false);
          return;
        }

        setCameraList(devices);

        // Prefer back camera on mobile (environment) or last chosen
        let targetCameraId = devices[0].id;
        const backCam = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('belakang') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        if (backCam) {
          targetCameraId = backCam.id;
        }

        setSelectedCameraId(targetCameraId);

        const html5QrCode = new Html5Qrcode(scannerContainerId.current, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13
          ],
          verbose: false
        });
        html5QrCodeRef.current = html5QrCode;

        const config = {
          fps: fps,
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          targetCameraId,
          config,
          (decodedText) => {
            const now = Date.now();
            // Debounce scan rate to prevent duplicate fast triggers (min 1.5s between same read)
            if (now - lastScannedTime.current > 1500) {
              lastScannedTime.current = now;
              onScanSuccess(decodedText);
            }
          },
          () => {
            // scan failure callback (ignored - happens on each empty frame)
          }
        );

        if (isMounted) {
          setIsInitializing(false);
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Error starting camera scanner:', err);
        setCameraError(
          err.message?.includes('Permission') || err.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Silakan izinkan akses kamera di pengaturan browser Anda.'
            : `Gagal mengakses kamera: ${err.message || 'Error kamera tidak dikenal'}`
        );
        setIsInitializing(false);
      }
    }

    initScanner();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current) {
        if (html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.stop().then(() => {
            try {
              html5QrCodeRef.current?.clear();
            } catch (e) {}
          }).catch(() => {});
        } else {
          try {
            html5QrCodeRef.current.clear();
          } catch (e) {}
        }
      }
    };
  }, [isScanningActive, fps, qrboxSize, onScanSuccess]);

  // Handle switching camera
  const handleCameraChange = async (newCameraId: string) => {
    setSelectedCameraId(newCameraId);
    if (!html5QrCodeRef.current) return;

    try {
      if (html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.stop();
      }
      setIsInitializing(true);

      await html5QrCodeRef.current.start(
        newCameraId,
        {
          fps: fps,
          qrbox: { width: qrboxSize, height: qrboxSize },
          aspectRatio: 1.0
        },
        (decodedText) => {
          const now = Date.now();
          if (now - lastScannedTime.current > 1500) {
            lastScannedTime.current = now;
            onScanSuccess(decodedText);
          }
        },
        () => {}
      );
      setIsInitializing(false);
    } catch (e: any) {
      console.error('Error switching camera:', e);
      setCameraError('Gagal mengganti kamera: ' + e.message);
      setIsInitializing(false);
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto bg-slate-900 rounded-2xl overflow-hidden shadow-xl border border-slate-700">
      {/* Top Bar with Camera selector & status */}
      <div className="bg-slate-800/90 backdrop-blur px-4 py-2.5 flex items-center justify-between border-b border-slate-700 text-xs text-white">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-slate-200">Kamera Scanner Aktif</span>
        </div>

        {cameraList.length > 1 && (
          <select
            value={selectedCameraId}
            onChange={(e) => handleCameraChange(e.target.value)}
            className="bg-slate-700 text-slate-100 text-[11px] px-2 py-1 rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[140px] truncate"
          >
            {cameraList.map((cam, idx) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Kamera ${idx + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Video Viewport Container */}
      <div className="relative aspect-square w-full bg-black flex items-center justify-center overflow-hidden">
        <div id={scannerContainerId.current} className="w-full h-full" />

        {/* Loading Spinner */}
        {isInitializing && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-3 text-white z-10">
            <RefreshCw className="w-8 h-8 text-yellow-400 animate-spin" />
            <p className="text-xs text-slate-300 font-medium">Menghubungkan Kamera...</p>
          </div>
        )}

        {/* Camera Error Display */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center text-white z-20">
            <CameraOff className="w-12 h-12 text-rose-400 mb-2" />
            <p className="text-sm font-semibold text-rose-300 mb-1">Akses Kamera Terkendala</p>
            <p className="text-xs text-slate-300 mb-4 max-w-xs">{cameraError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-xs font-semibold rounded-lg shadow transition"
            >
              Muat Ulang Halaman
            </button>
          </div>
        )}

        {/* Target Finder Overlay Box */}
        {!isInitializing && !cameraError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 border-2 border-dashed border-yellow-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {/* Corner Indicators */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-yellow-400 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-yellow-400 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-yellow-400 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-yellow-400 rounded-br-lg" />

              {/* Laser Scan line animation */}
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-yellow-300 to-transparent animate-bounce opacity-80" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom helper text */}
      <div className="bg-slate-800/95 px-4 py-2.5 text-center border-t border-slate-700">
        <p className="text-xs text-slate-300 flex items-center justify-center gap-1.5 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          <span>{instructionText}</span>
        </p>
      </div>
    </div>
  );
};
