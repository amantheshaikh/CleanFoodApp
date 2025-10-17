import { useEffect, useMemo, useState } from 'react';
import { BarcodeScannerTab } from './BarcodeScannerTab';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Camera, Info } from 'lucide-react';

interface BarcodeScannerSectionProps {
  ingredients: string;
  onIngredientsChange: (text: string) => void;
  onAnalysisRequest: (text: string) => Promise<void>;
  onAddProductFormChange: (isVisible: boolean) => void;
}

export function BarcodeScannerSection({
  ingredients,
  onIngredientsChange,
  onAnalysisRequest,
  onAddProductFormChange,
}: BarcodeScannerSectionProps) {
  const [cameraPermission, setCameraPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  const {
    isScanning,
    showCameraPrompt,
    setShowCameraPrompt,
    cameraError,
    barcodeError,
    barcodeDebug,
    scannedBarcode,
    showAddProductForm,
    productFound,
    isLoadingProduct,
    quaggaContainerRef,
    startCamera,
    stopCamera,
    handleProductAdded,
    handleCancelAddProduct,
    resetScannerUi,
  } = useBarcodeScanner({
    onIngredientsFound: onIngredientsChange,
    onAnalyzeText: onAnalysisRequest,
    onPermissionChange: setCameraPermission,
  });

  useEffect(() => {
    onAddProductFormChange(showAddProductForm);
  }, [onAddProductFormChange, showAddProductForm]);

  useEffect(() => {
    return () => {
      resetScannerUi();
      onAddProductFormChange(false);
    };
  }, [onAddProductFormChange, resetScannerUi]);

  const canUseCamera = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices),
    []
  );

  return (
    <div className="space-y-4">
      <BarcodeScannerTab
        showAddProductForm={showAddProductForm}
        scannedBarcode={scannedBarcode}
        onProductAdded={handleProductAdded}
        onCancelAddProduct={handleCancelAddProduct}
        barcodeError={barcodeError}
        barcodeDebug={barcodeDebug}
        cameraError={cameraError}
        cameraPermission={cameraPermission}
        onRequestCameraPermission={() => setShowCameraPrompt(true)}
        isScanning={isScanning}
        isLoadingProduct={isLoadingProduct}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        productFound={productFound}
        quaggaContainerRef={quaggaContainerRef}
        canUseCamera={canUseCamera}
        ingredients={ingredients}
        onIngredientsChange={onIngredientsChange}
        activeTab="barcode"
      />

      <Dialog open={showCameraPrompt} onOpenChange={setShowCameraPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Camera Access Required
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>This app needs access to your camera to scan product barcodes.</span>
                </div>

                <div className="bg-muted p-3 rounded-lg text-sm">
                  <div className="font-medium mb-2">What will happen next:</div>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Your browser will ask for camera permission</li>
                    <li>Click "Allow" to enable the camera</li>
                    <li>Point your camera at a product barcode</li>
                    <li>Tap "Scan Barcode" to read the code</li>
                  </ol>
                </div>

                <div className="text-xs text-muted-foreground">
                  Your privacy is protected - camera feed stays on your device.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setShowCameraPrompt(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowCameraPrompt(false);
                startCamera();
              }}
            >
              Enable Camera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
